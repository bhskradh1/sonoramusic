import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

type AudioStream = {
  bitrate?: number;
  format?: string;
  mimeType?: string;
  quality?: string;
  url?: string;
  videoOnly?: boolean;
};

type ResolvedAudio = {
  videoId: string;
  title: string;
  uploader: string;
  duration: number;
  directUrl: string;
  mimeType: string;
  format: string;
  bitrate: number;
  quality: string;
  instanceBase: string;
  expiresAt: number;
};

type ApiRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 3 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const STREAM_CONNECT_TIMEOUT_MS = 15_000;
const AUDIO_CACHE = new Map<string, ResolvedAudio>();
const RATE_LIMIT = new Map<string, number[]>();

// Public Piped instances are community-operated and can become unhealthy without notice.
// Keep a static safety net, but refresh the maintained TeamPiped list at runtime.
const PIPED_INSTANCE_LIST_URL =
  'https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md';
const PIPED_INSTANCE_LIST_TTL_MS = 15 * 60 * 1000;
const INSTANCE_DISCOVERY_TIMEOUT_MS = 5_000;
const INSTANCE_REQUEST_TIMEOUT_MS = 7_000;
const INSTANCE_BATCH_SIZE = 4;

const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi-libre.kavin.rocks',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://pipedapi.ducks.party',
  'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me',
  'https://api.piped.private.coffee',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc',
];

let cachedPipedInstances: string[] = [];
let pipedInstancesFetchedAt = 0;

const normalizePipedInstance = (candidate: string): string | null => {
  try {
    const url = new URL(candidate.trim());
    if (
      url.protocol !== 'https:' ||
      !url.hostname.toLowerCase().includes('piped') ||
      url.hostname === 'piped.video' ||
      url.hostname === 'docs.piped.video'
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

const parsePipedInstances = (document: string): string[] => {
  const matches = document.match(/https:\/\/[a-z0-9.-]*piped[a-z0-9.-]*\.[a-z]{2,}/gi) || [];
  return [...new Set(matches.map(normalizePipedInstance).filter((value): value is string => Boolean(value)))];
};

const getPipedInstances = async (): Promise<string[]> => {
  const now = Date.now();
  if (cachedPipedInstances.length && now - pipedInstancesFetchedAt < PIPED_INSTANCE_LIST_TTL_MS) {
    return cachedPipedInstances;
  }

  const configured = (process.env.YOUTUBE_AUDIO_PIPED_INSTANCES || '')
    .split(',')
    .map((value) => normalizePipedInstance(value))
    .filter((value): value is string => Boolean(value));

  let discovered: string[] = [];
  try {
    const response = await fetch(PIPED_INSTANCE_LIST_URL, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(INSTANCE_DISCOVERY_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (response.ok) discovered = parsePipedInstances(await response.text());
    else console.warn('Piped instance discovery returned:', response.status);
  } catch (error) {
    console.warn('Piped instance discovery failed:', error instanceof Error ? error.message : error);
  }

  cachedPipedInstances = [...new Set([...configured, ...discovered, ...DEFAULT_PIPED_INSTANCES])];
  pipedInstancesFetchedAt = now;
  return cachedPipedInstances;
};

const setCommonHeaders = (res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range, Content-Type');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};

const sendJson = (res: ServerResponse, status: number, payload: Record<string, unknown>) => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};

const isRateLimited = (req: IncomingMessage): boolean => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])
    ?.trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (RATE_LIMIT.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 90) {
    RATE_LIMIT.set(ip, recent);
    return true;
  }
  recent.push(now);
  RATE_LIMIT.set(ip, recent);

  if (RATE_LIMIT.size > 2_000) {
    for (const [key, timestamps] of RATE_LIMIT) {
      const active = timestamps.filter((timestamp) => now - timestamp < 60_000);
      if (active.length) RATE_LIMIT.set(key, active);
      else RATE_LIMIT.delete(key);
    }
  }
  return false;
};

const resolveAudio = async (videoId: string, forceRefresh = false): Promise<ResolvedAudio> => {
  const cached = AUDIO_CACHE.get(videoId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached;
  AUDIO_CACHE.delete(videoId);

  const instances = await getPipedInstances();
  const errors: string[] = [];

  const tryInstance = async (instanceBase: string): Promise<ResolvedAudio> => {
    const response = await fetch(`${instanceBase}/streams/${encodeURIComponent(videoId)}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(INSTANCE_REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`${instanceBase} returned HTTP ${response.status}`);

    const payload = (await response.json()) as {
      title?: string;
      uploader?: string;
      duration?: number;
      audioStreams?: AudioStream[];
    };
    const streams = Array.isArray(payload.audioStreams)
      ? payload.audioStreams
          .filter((stream) => {
            if (!stream?.url || stream.videoOnly) return false;
            const mimeType = (stream.mimeType || '').split(';')[0].toLowerCase();
            const format = (stream.format || '').toLowerCase();
            return mimeType === 'audio/mp4' || mimeType === 'audio/webm' || format === 'm4a' || format === 'webm';
          })
          .map((stream) => {
            const mimeType = (stream.mimeType || '').split(';')[0].toLowerCase();
            const format = (stream.format || '').toUpperCase();
            const normalizedMime = mimeType || (format === 'WEBM' ? 'audio/webm' : 'audio/mp4');
            return { ...stream, mimeType: normalizedMime };
          })
      : [];

    streams.sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0));
    const selected = streams[0];
    if (!selected?.url) throw new Error(`${instanceBase} returned no audio-only formats`);

    const directUrl = new URL(selected.url);
    if (directUrl.protocol !== 'https:') {
      throw new Error(`${instanceBase} returned a non-HTTPS stream URL`);
    }

    const format = (selected.format || (selected.mimeType === 'audio/webm' ? 'WEBM' : 'M4A')).toUpperCase();
    return {
      videoId,
      title: String(payload.title || ''),
      uploader: String(payload.uploader || ''),
      duration: Number(payload.duration || 0),
      directUrl: directUrl.toString(),
      mimeType: selected.mimeType || 'audio/mp4',
      format,
      bitrate: Number(selected.bitrate || 0),
      quality: String(selected.quality || (selected.bitrate ? `${Math.round(selected.bitrate / 1000)} kbps` : 'high quality')),
      instanceBase,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  };

  // Try small batches in parallel: one failing or slow instance cannot block
  // every other public instance, while we avoid flooding the whole pool.
  for (let offset = 0; offset < instances.length; offset += INSTANCE_BATCH_SIZE) {
    const batch = instances.slice(offset, offset + INSTANCE_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (instanceBase) => {
      try {
        return await tryInstance(instanceBase);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : `${instanceBase} failed`);
        return null;
      }
    }));
    const successful = results.filter((value): value is ResolvedAudio => Boolean(value));
    if (successful.length) {
      successful.sort((a, b) => b.bitrate - a.bitrate);
      const resolved = successful[0];
      AUDIO_CACHE.set(videoId, resolved);
      if (AUDIO_CACHE.size > 500) {
        const oldest = AUDIO_CACHE.keys().next().value;
        if (oldest) AUDIO_CACHE.delete(oldest);
      }
      return resolved;
    }
  }

  const shownErrors = errors.slice(0, 8);
  const remaining = Math.max(0, errors.length - shownErrors.length);
  throw new Error(
    `Unable to resolve an audio stream. ${shownErrors.join('; ')}${remaining ? `; and ${remaining} more instance failures` : ''}`,
  );
}

const streamAudio = async (
  req: ApiRequest,
  res: ServerResponse,
  videoId: string,
  isHeadRequest: boolean,
) => {
  let audio = await resolveAudio(videoId);
  const range = req.headers.range;
  const createUpstreamRequest = async (resolved: ResolvedAudio) => {
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), STREAM_CONNECT_TIMEOUT_MS);
    try {
      // Clear the timeout as soon as headers arrive. The body remains a live
      // stream for the full song duration rather than being cut off at 15s.
      return await fetch(resolved.directUrl, {
        method: isHeadRequest ? 'HEAD' : 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          // Supply a YouTube referrer for instances that return direct
          // googlevideo URLs; Piped's own proxy safely ignores these headers.
          Referer: 'https://www.youtube.com/',
          Origin: 'https://www.youtube.com',
          Accept: 'audio/webm,audio/mp4,audio/*;q=0.9,*/*;q=0.5',
          ...(range ? { Range: range } : {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(connectTimeout);
    }
  };

  let upstream = await createUpstreamRequest(audio);
  if ((upstream.status === 403 || upstream.status === 404 || upstream.status >= 500) && !req.destroyed) {
    // Expiring upstream signatures occasionally go stale before the short
    // cache window; resolve once more against the current Piped instance pool.
    audio = await resolveAudio(videoId, true);
    upstream = await createUpstreamRequest(audio);
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
    sendJson(res, 502, { error: `Audio provider returned ${upstream.status}` });
    return;
  }

  const upstreamContentType = upstream.headers.get('content-type')?.split(';')[0];
  if (
    upstream.status !== 416 &&
    upstreamContentType &&
    !upstreamContentType.startsWith('audio/') &&
    upstreamContentType !== 'application/octet-stream'
  ) {
    sendJson(res, 502, { error: 'Audio provider did not return an audio stream.' });
    return;
  }
  const contentType = upstreamContentType?.startsWith('audio/') ? upstreamContentType : audio.mimeType;
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
  res.setHeader('X-Accel-Buffering', 'no');
  if (upstream.headers.has('content-length')) {
    res.setHeader('Content-Length', upstream.headers.get('content-length') as string);
  }
  if (upstream.headers.has('content-range')) {
    res.setHeader('Content-Range', upstream.headers.get('content-range') as string);
  }
  if (upstream.headers.has('last-modified')) {
    res.setHeader('Last-Modified', upstream.headers.get('last-modified') as string);
  }

  if (isHeadRequest || !upstream.body) {
    res.end();
    return;
  }

  res.flushHeaders?.();
  const audioBody = Readable.fromWeb(upstream.body as never);
  audioBody.on('error', (error) => {
    console.error('YouTube audio proxy stream failed:', error);
    if (!res.headersSent) sendJson(res, 502, { error: 'Audio stream interrupted' });
    else res.destroy(error);
  });
  res.on('close', () => {
    if (!res.writableEnded) audioBody.destroy();
  });
  audioBody.pipe(res);
};

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export const maxDuration = 60;

export default async function handler(req: ApiRequest, res: ServerResponse) {
  setCommonHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }
  if (isRateLimited(req)) {
    sendJson(res, 429, { error: 'Too many audio requests. Please try again shortly.' });
    return;
  }

  const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  const videoId = (requestUrl.searchParams.get('id') || requestUrl.searchParams.get('videoId') || '').trim();
  const shouldStream = requestUrl.searchParams.get('stream') === '1';
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    sendJson(res, 400, { error: 'A valid 11-character YouTube video ID is required.' });
    return;
  }

  try {
    if (shouldStream) {
      await streamAudio(req, res, videoId, req.method === 'HEAD');
      return;
    }

    const audio = await resolveAudio(videoId);
    const proxyStreamUrl = `/api/youtube-audio?id=${encodeURIComponent(videoId)}&stream=1`;
    const directHost = new URL(audio.directUrl).hostname.toLowerCase();
    // Public Piped CDN URLs already provide CORS and byte-range support.
    // Play those directly so a serverless function does not stay open for an
    // entire song. Use our header-aware proxy only for raw Google Video URLs.
    const streamUrl = directHost.endsWith('googlevideo.com')
      ? proxyStreamUrl
      : audio.directUrl;
    const metadata = {
      videoId,
      title: audio.title,
      artist: audio.uploader,
      duration: audio.duration,
      format: audio.format,
      mimeType: audio.mimeType,
      bitrate: audio.bitrate,
      quality: audio.quality,
      // directUrl is the provider's signed, short-lived audio URL. Piped CDN
      // URLs are range-enabled and played directly; raw Google Video URLs use
      // our proxy to add the expected request headers and forward byte ranges.
      directUrl: audio.directUrl,
      streamUrl,
      proxyStreamUrl,
      expiresAt: new Date(audio.expiresAt).toISOString(),
    };
    if (req.method === 'HEAD') {
      const body = JSON.stringify(metadata);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Length', Buffer.byteLength(body));
      res.end();
    } else {
      sendJson(res, 200, metadata);
    }
  } catch (error) {
    console.error('YouTube audio API error:', error);
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : 'Could not resolve YouTube audio.',
    });
  }
}
