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

/**
 * Try the explicitly configured API first, then the known production API,
 * then a same-origin route. The final fallback supports deployments where the
 * Vite frontend and Vercel function are hosted together.
 */
export const getYoutubeAudioApiUrls = (): string[] => {
  const configured = import.meta.env.VITE_YTMUSIC_AUDIO_API_URL?.trim();
  const candidates = [configured, DEFAULT_AUDIO_API_URL];

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    // The Flutter WebView is served from a local 127.0.0.1 origin and does not
    // expose an /api route; do not waste a request against that local origin.
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
    return `Could not connect to the audio API at ${host}. Check that the API is deployed and that its CORS settings allow this app.`;
  }
  return error instanceof Error ? error.message : 'Unknown network error';
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

const readErrorResponse = async (response: Response): Promise<string> => {
  const payload = await response.json().catch(() => ({})) as YoutubeAudioApiResponse;
  return payload.error || `HTTP ${response.status}`;
};

const validateAudioBlob = (blob: Blob, contentType?: string): Blob => {
  if (!blob.size) throw new Error('The audio provider returned an empty file.');
  const mimeType = blob.type || contentType || 'audio/mp4';
  if (!mimeType.startsWith('audio/') && mimeType !== 'application/octet-stream') {
    throw new Error(`The provider returned a non-audio file (${mimeType}).`);
  }
  return blob.type ? blob : new Blob([blob], { type: mimeType });
};

/** Downloads a complete audio file for IndexedDB playlist storage. */
export const fetchYoutubeAudioBlob = async (videoId: string): Promise<Blob> => {
  const failures: string[] = [];

  for (const apiUrl of getYoutubeAudioApiUrls()) {
    const separator = apiUrl.includes('?') ? '&' : '?';
    const streamEndpoint = `${apiUrl}${separator}id=${encodeURIComponent(videoId)}&stream=1`;
    let binaryError = '';

    // First try the server-side proxy. It adds the upstream request headers and
    // forwards byte ranges; a provider CDN URL is used below if it fails.
    try {
      const binaryResponse = await fetch(streamEndpoint, { cache: 'no-store' });
      if (binaryResponse.ok) {
        const contentType = binaryResponse.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
        if (!contentType || contentType.startsWith('audio/') || contentType === 'application/octet-stream') {
          return validateAudioBlob(await binaryResponse.blob(), contentType);
        }
        binaryError = `The API proxy returned ${contentType || 'an unknown content type'}, not audio.`;
      } else {
        binaryError = await readErrorResponse(binaryResponse);
      }
    } catch (error) {
      binaryError = describeNetworkError(error, apiUrl);
    }

    // Resolve metadata and then try the provider URL plus the API's proxy URL.
    try {
      const metadataResponse = await fetch(
        `${apiUrl}${separator}id=${encodeURIComponent(videoId)}`,
        { cache: 'no-store' },
      );
      const metadata = await metadataResponse.json().catch(() => ({})) as YoutubeAudioApiResponse;
      if (!metadataResponse.ok) {
        failures.push(`${new URL(apiUrl).host}: ${metadata.error || `HTTP ${metadataResponse.status}`}; proxy: ${binaryError}`);
        continue;
      }

      const streamUrls = [metadata.streamUrl, metadata.directUrl, metadata.proxyStreamUrl]
        .filter((value): value is string => Boolean(value))
        .map((value) => new URL(value, apiUrl).toString())
        .filter((value, index, values) => values.indexOf(value) === index);

      if (!streamUrls.length) {
        failures.push(`${new URL(apiUrl).host}: API returned no stream URL; proxy: ${binaryError}`);
        continue;
      }

      for (const streamUrl of streamUrls) {
        try {
          const response = await fetch(streamUrl, { cache: 'no-store', mode: 'cors' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentType = response.headers.get('content-type')?.split(';')[0].toLowerCase() || '';
          const blob = await response.blob();
          return validateAudioBlob(blob, contentType || metadata.mimeType);
        } catch (error) {
          failures.push(`${new URL(streamUrl).host}: ${describeNetworkError(error, streamUrl)}`);
        }
      }
    } catch (error) {
      failures.push(`${new URL(apiUrl).host}: ${describeNetworkError(error, apiUrl)}; proxy: ${binaryError}`);
    }
  }

  throw new Error(
    `Playlist download could not fetch audio for ${videoId}. ${failures.slice(0, 5).join(' | ') || 'No audio API URL is configured.'}`,
  );
};
