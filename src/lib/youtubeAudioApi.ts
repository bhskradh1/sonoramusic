export interface YoutubeAudioApiResponse {
  videoId?: string;
  title?: string;
  artist?: string;
  mimeType?: string;
  streamUrl?: string;
  proxyStreamUrl?: string;
  directUrl?: string;
  error?: string;
}

export interface ResolvedYoutubeAudio {
  streamUrl: string;
  mimeType?: string;
  apiUrl: string;
}

const DEFAULT_AUDIO_API_URL = 'https://sonorasound.vercel.app/api/youtube-audio';
const METADATA_TIMEOUT_MS = 30_000;
const PROVIDER_DOWNLOAD_TIMEOUT_MS = 4 * 60_000;
const PROXY_RANGE_TIMEOUT_MS = 50_000;
const PROXY_CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;

export const getYoutubeAudioApiUrls = (): string[] => {
  const configured = import.meta.env.VITE_YTMUSIC_AUDIO_API_URL?.trim();
  const candidates = [configured, DEFAULT_AUDIO_API_URL];

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!isLoopbackHost) candidates.push(`${window.location.origin}/api/youtube-audio`);
  }

  const resolved = candidates
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value, typeof window === 'undefined' ? 'https://localhost' : window.location.origin).toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);

  return [...new Set(resolved)];
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const describeNetworkError = (error: unknown, url: string): string => {
  if (error instanceof TypeError) {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // Keep the original URL if it is not parseable.
    }
    return `Could not connect to ${host}. Check the API/provider availability and CORS settings.`;
  }
  if (isAbortError(error)) return 'The request timed out.';
  return error instanceof Error ? error.message : 'Unknown network error';
};

const fetchJsonWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: 'no-store',
      mode: 'cors',
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
};

const validateAudioBlob = (blob: Blob, contentType?: string): Blob => {
  if (!blob.size) throw new Error('The audio provider returned an empty file.');
  const mimeType = (blob.type || contentType || 'audio/mp4').split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('audio/') && mimeType !== 'application/octet-stream') {
    throw new Error(`The provider returned a non-audio file (${mimeType}).`);
  }
  return blob.type ? blob : new Blob([blob], { type: mimeType });
};

const isGoogleVideoUrl = (value: string): boolean => {
  try {
    return new URL(value).hostname.toLowerCase().endsWith('googlevideo.com');
  } catch {
    return false;
  }
};

const isApiProxyUrl = (streamUrl: string, apiUrl: string): boolean => {
  try {
    const stream = new URL(streamUrl);
    const api = new URL(apiUrl);
    return stream.origin === api.origin &&
      stream.pathname.endsWith('/api/youtube-audio') &&
      stream.searchParams.get('stream') === '1';
  } catch {
    return false;
  }
};

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; buffer: ArrayBuffer }> => {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as YoutubeAudioApiResponse;
      throw new Error(payload.error || `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    }
    const buffer = await response.arrayBuffer();
    return { response, buffer };
  } catch (error) {
    if (timedOut) throw new Error(`Audio download timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
};

/**
 * Google Video URLs are IP-bound and must pass through the Vercel API. Fetch
 * them in byte ranges so no single serverless invocation streams a whole song.
 */
const fetchProxyAudioInRanges = async (
  streamUrl: string,
  fallbackMimeType?: string,
): Promise<Blob> => {
  const first = await fetchWithTimeout(
    streamUrl,
    { cache: 'no-store', mode: 'cors', headers: { Range: 'bytes=0-0' } },
    PROXY_RANGE_TIMEOUT_MS,
  );

  const firstType = first.response.headers.get('content-type')?.split(';')[0].toLowerCase() || fallbackMimeType || 'audio/mp4';
  if (first.response.status === 200) {
    return validateAudioBlob(new Blob([first.buffer], { type: firstType }), firstType);
  }
  if (first.response.status !== 206) {
    throw new Error(`The audio proxy did not honor byte ranges (HTTP ${first.response.status}).`);
  }

  const contentRange = first.response.headers.get('content-range') || '';
  const rangeMatch = contentRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!rangeMatch || Number(rangeMatch[1]) !== 0 || Number(rangeMatch[2]) !== 0) {
    throw new Error('The audio proxy returned an invalid Content-Range header.');
  }

  const totalBytes = Number(rangeMatch[3]);
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0 || totalBytes > MAX_AUDIO_BYTES) {
    throw new Error('The audio file has an invalid or excessive size.');
  }

  const chunks: BlobPart[] = [first.buffer];
  for (let start = 1; start < totalBytes; start += PROXY_CHUNK_SIZE) {
    const end = Math.min(totalBytes - 1, start + PROXY_CHUNK_SIZE - 1);
    let received: ArrayBuffer | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 2 && !received; attempt += 1) {
      try {
        const part = await fetchWithTimeout(
          streamUrl,
          {
            cache: 'no-store',
            mode: 'cors',
            headers: { Range: `bytes=${start}-${end}` },
          },
          PROXY_RANGE_TIMEOUT_MS,
        );
        if (part.response.status !== 206) {
          throw new Error(`The audio proxy returned HTTP ${part.response.status} for bytes ${start}-${end}.`);
        }
        const partRange = part.response.headers.get('content-range') || '';
        const match = partRange.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
        if (!match || Number(match[1]) !== start || Number(match[2]) !== end || Number(match[3]) !== totalBytes) {
          throw new Error('The audio proxy returned an inconsistent byte range.');
        }
        if (part.buffer.byteLength !== end - start + 1) {
          throw new Error('The audio proxy returned an incomplete byte range.');
        }
        received = part.buffer;
      } catch (error) {
        lastError = error;
      }
    }

    if (!received) {
      throw lastError instanceof Error ? lastError : new Error(`Could not download audio bytes ${start}-${end}.`);
    }
    chunks.push(received);
  }

  return validateAudioBlob(new Blob(chunks, { type: firstType }), firstType);
};

const fetchProviderAudio = async (
  streamUrl: string,
  fallbackMimeType?: string,
): Promise<Blob> => {
  const { response, buffer } = await fetchWithTimeout(
    streamUrl,
    { cache: 'no-store', mode: 'cors' },
    PROVIDER_DOWNLOAD_TIMEOUT_MS,
  );
  const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase() || fallbackMimeType;
  return validateAudioBlob(new Blob([buffer], { type: contentType || 'audio/mp4' }), contentType);
};

export const resolveYoutubeAudioStream = async (
  videoId: string,
  signal?: AbortSignal,
): Promise<ResolvedYoutubeAudio> => {
  const failures: string[] = [];

  for (const apiUrl of getYoutubeAudioApiUrls()) {
    const separator = apiUrl.includes('?') ? '&' : '?';
    const requestUrl = `${apiUrl}${separator}id=${encodeURIComponent(videoId)}`;

    try {
      const response = await fetch(requestUrl, { signal, cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as YoutubeAudioApiResponse;
      if (!response.ok || !payload.streamUrl) {
        failures.push(`${new URL(apiUrl).host}: ${payload.error || `HTTP ${response.status}`}`);
        continue;
      }

      return {
        streamUrl: new URL(payload.streamUrl, apiUrl).toString(),
        mimeType: payload.mimeType,
        apiUrl,
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      failures.push(describeNetworkError(error, apiUrl));
    }
  }

  throw new Error(
    `Could not resolve YouTube audio for ${videoId}. ${failures.slice(0, 3).join(' | ') || 'No audio API URL is configured.'}`,
  );
};

/**
 * Download the full file for IndexedDB. Direct Piped/Invidious URLs are tried
 * first. IP-bound Google Video streams use the API's ranged proxy fallback.
 */
export const fetchYoutubeAudioBlob = async (videoId: string): Promise<Blob> => {
  const failures: string[] = [];

  for (const apiUrl of getYoutubeAudioApiUrls()) {
    const separator = apiUrl.includes('?') ? '&' : '?';
    const metadataUrl = `${apiUrl}${separator}id=${encodeURIComponent(videoId)}`;

    try {
      const metadataResponse = await fetchJsonWithTimeout(metadataUrl);
      const metadata = await metadataResponse.json().catch(() => ({})) as YoutubeAudioApiResponse;
      if (!metadataResponse.ok) {
        failures.push(`${new URL(apiUrl).host}: ${metadata.error || `HTTP ${metadataResponse.status}`}`);
        continue;
      }

      const candidates = [
        metadata.streamUrl && !isGoogleVideoUrl(metadata.streamUrl) ? metadata.streamUrl : undefined,
        metadata.directUrl && !isGoogleVideoUrl(metadata.directUrl) ? metadata.directUrl : undefined,
        metadata.proxyStreamUrl,
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value, apiUrl).toString())
        .filter((value, index, values) => values.indexOf(value) === index);

      if (!candidates.length) {
        failures.push(`${new URL(apiUrl).host}: API returned no usable audio stream URL.`);
        continue;
      }

      for (const streamUrl of candidates) {
        try {
          if (isApiProxyUrl(streamUrl, apiUrl)) {
            return await fetchProxyAudioInRanges(streamUrl, metadata.mimeType);
          }
          return await fetchProviderAudio(streamUrl, metadata.mimeType);
        } catch (error) {
          failures.push(`${new URL(streamUrl).host}: ${describeNetworkError(error, streamUrl)}`);
        }
      }
    } catch (error) {
      failures.push(`${new URL(apiUrl).host}: ${describeNetworkError(error, apiUrl)}`);
    }
  }

  throw new Error(
    `Playlist download could not fetch audio for ${videoId}. ${failures.slice(0, 6).join(' | ') || 'No audio API URL is configured.'}`,
  );
};
