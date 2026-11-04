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

// Public Piped / Invidious instances are best-effort upstreams and are often
// blocked by YouTube. Override with env vars (comma-separated base URLs):
//   YOUTUBE_AUDIO_PIPED_INSTANCES, YOUTUBE_AUDIO_INVIDIOUS_INSTANCES
// Keep this fallback pool aligned with the public instance directories.
// Public instances can still fail or rate-limit, so every configured/default
// host is tried concurrently and the first usable stream wins.
const DEFAULT_PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si',
  'https://piped-api.codespace.cz',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.darkness.services',
  'https://pipedapi.orangenet.cc',
];
const DEFAULT_INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
];

const parseList = (value: string | undefined, fallback: string[]): string[] => {
  const configured = (value || '')
    .split(',')
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
  // Merge rather than replace: stale environment settings must not remove
  // every maintained fallback instance from the resolver pool.
  return [...new Set([...configured, ...fallback])];
};
const getPipedInstances = () => parseList(process.env.YOUTUBE_AUDIO_PIPED_INSTANCES, DEFAULT_PIPED_INSTANCES);
const getInvidiousInstances = () => parseList(process.env.YOUTUBE_AUDIO_INVIDIOUS_INSTANCES, DEFAULT_INVIDIOUS_INSTANCES);

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
  if (recent.length >= 300) {
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

const mimeFromFormat = (mime?: string, format?: string, type?: string): string => {
  const m = (mime || type || '').split(';')[0].trim().toLowerCase();
  if (m.startsWith('audio/')) return m;
  const f = (format || '').toLowerCase();
  if (f.includes('webm') || f.includes('opus')) return 'audio/webm';
  if (f.includes('mp3')) return 'audio/mpeg';
  return 'audio/mp4';
};

const isAudioStream = (stream: AudioStream): boolean => {
  if (!stream?.url || stream.videoOnly) return false;
  const mime = (stream.mimeType || '').toLowerCase();
  if (mime.startsWith('video/')) return false;
  const fmt = (stream.format || '').toLowerCase();
  return mime.startsWith('audio/') || /m4a|webm|opus|mp3|aac|mp4a/.test(fmt);
};

const finish = (
  videoId: string,
  meta: { title?: string; uploader?: string; duration?: number },
  url: string,
  mimeType: string,
  format: string,
  bitrate: number,
  quality: string,
  instanceBase: string,
): ResolvedAudio => {
  const directUrl = new URL(url);
  if (directUrl.protocol !== 'https:') throw new Error('non-HTTPS stream');
  const resolved: ResolvedAudio = {
    videoId,
    title: String(meta.title || ''),
    uploader: String(meta.uploader || ''),
    duration: Number(meta.duration || 0),
    directUrl: directUrl.toString(),
    mimeType,
    format: format.toUpperCase(),
    bitrate,
    quality: quality || (bitrate ? `${Math.round(bitrate / 1000)} kbps` : 'high quality'),
    instanceBase,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return resolved;
};

const fetchJson = async (url: string) => {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
};

// Prefer AAC (audio/mp4): it plays everywhere, including iOS and just_audio.
const pickBest = <T extends { mimeType?: string; bitrate?: number }>(streams: T[]): T | undefined =>
  [...streams].sort((a, b) => {
    const am = a.mimeType === 'audio/mp4' ? 1 : 0;
    const bm = b.mimeType === 'audio/mp4' ? 1 : 0;
    if (am !== bm) return bm - am;
    return Number(b.bitrate || 0) - Number(a.bitrate || 0);
  })[0];

const resolveViaPiped = async (videoId: string, base: string): Promise<ResolvedAudio> => {
  const payload = await fetchJson(`${base}/streams/${encodeURIComponent(videoId)}`) as {
    title?: string; uploader?: string; duration?: number; audioStreams?: AudioStream[]; error?: string;
  };
  const all = Array.isArray(payload.audioStreams) ? payload.audioStreams : [];
  const usable = all.filter(isAudioStream).map((st) => ({ ...st, mimeType: mimeFromFormat(st.mimeType, st.format) }));
  const best = pickBest(usable);
  if (!best?.url) {
    throw new Error(`${all.length} audio streams, none usable${payload.error ? ` (${payload.error})` : ''}`);
  }
  return finish(videoId, payload, best.url, best.mimeType!, best.format || 'M4A', Number(best.bitrate || 0), String(best.quality || ''), base);
};

const resolveViaInvidious = async (videoId: string, base: string): Promise<ResolvedAudio> => {
  const payload = await fetchJson(`${base}/api/v1/videos/${encodeURIComponent(videoId)}?local=true`) as {
    title?: string; author?: string; lengthSeconds?: number; error?: string;
    adaptiveFormats?: Array<{ url?: string; type?: string; bitrate?: string | number; audioQuality?: string }>;
  };
  if (payload.error) throw new Error(payload.error);
  const all = payload.adaptiveFormats || [];
  const usable = all
    .filter((f) => f.url && (f.type || '').startsWith('audio/'))
    .map((f) => ({ url: f.url!, mimeType: mimeFromFormat(undefined, undefined, f.type), bitrate: Number(f.bitrate || 0), quality: f.audioQuality || '' }));
  const best = pickBest(usable);
  if (!best) throw new Error(`${all.length} formats, no audio`);
  const absolute = new URL(best.url, base).toString();
  return finish(videoId, { title: payload.title, uploader: payload.author, duration: payload.lengthSeconds }, absolute, best.mimeType, best.mimeType === 'audio/webm' ? 'WEBM' : 'M4A', best.bitrate, best.quality, base);
};

// Optional last resort: extract directly with youtubei.js (dependency is loaded
// lazily so the API still works if it is not installed). googlevideo URLs are
// IP-bound, so they are always played through this function's proxy.
let innertubePromise: Promise<any> | null = null;
const getInnertube = (): Promise<any> => {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const mod: any = await import('youtubei.js');
      const Innertube = mod.Innertube || mod.default?.Innertube || mod.default;
      return Innertube.create({ retrieve_player: true, generate_session_locally: true });
    })().catch((error) => {
      innertubePromise = null; // retry next request
      throw error;
    });
  }
  return innertubePromise;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

const resolveViaInnertube = async (videoId: string): Promise<ResolvedAudio> => {
  const yt = await getInnertube();
  let lastError = 'no format';
  for (const client of ['IOS', 'ANDROID', 'TV_EMBEDDED']) {
    try {
      const info = await yt.getBasicInfo(videoId, client);
      const format = info.chooseFormat({ type: 'audio', quality: 'best', format: 'mp4a' })
        || info.chooseFormat({ type: 'audio', quality: 'best' });
      const url: string | undefined = format?.url || (await format?.decipher?.(yt.session.player));
      if (!url) throw new Error('no url');
      return finish(
        videoId,
        { title: info.basic_info?.title, uploader: info.basic_info?.author, duration: info.basic_info?.duration },
        url,
        mimeFromFormat(format.mime_type),
        (format.mime_type || '').includes('webm') ? 'WEBM' : 'M4A',
        Number(format.bitrate || 0),
        '',
        'innertube',
      );
    } catch (error) {
      lastError = `${client}: ${error instanceof Error ? error.message : 'failed'}`;
    }
  }
  throw new Error(lastError);
};

const resolveAudio = async (videoId: string, forceRefresh = false): Promise<ResolvedAudio> => {
  const cached = AUDIO_CACHE.get(videoId);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached;
  AUDIO_CACHE.delete(videoId);

  const errors: string[] = [];
  const store = (resolved: ResolvedAudio) => {
    AUDIO_CACHE.set(videoId, resolved);
    if (AUDIO_CACHE.size > 500) {
      const oldest = AUDIO_CACHE.keys().next().value;
      if (oldest) AUDIO_CACHE.delete(oldest);
    }
    return resolved;
  };

  // Prefer Piped/Invidious first. Their CDN URLs can be fetched directly by
  // the browser, avoiding a long-running Vercel proxy for full playlist songs.
  const racers: Array<Promise<ResolvedAudio>> = [
    ...getPipedInstances().map((b) =>
      resolveViaPiped(videoId, b).catch((e) => { errors.push(`${b.replace('https://', '')}: ${e instanceof Error ? e.message : 'error'}`); throw e; })),
    ...getInvidiousInstances().map((b) =>
      resolveViaInvidious(videoId, b).catch((e) => { errors.push(`${b.replace('https://', '')}: ${e instanceof Error ? e.message : 'error'}`); throw e; })),
  ];
  try {
    return store(await Promise.any(racers));
  } catch {
    /* Fall back to Innertube if every public provider is unavailable. */
  }

  // Innertube's googlevideo URLs are IP-bound; use the API's ranged proxy.
  try {
    return store(await withTimeout(resolveViaInnertube(videoId), 20_000, 'innertube'));
  } catch (error) {
    errors.push(`innertube: ${error instanceof Error ? error.message : 'error'}`);
  }

  throw new Error(`Unable to resolve an audio stream. ${errors.slice(0, 8).join(' | ')}`);
};

const streamAudio = async (
  req: ApiRequest,
  res: ServerResponse,
  videoId: string,
  isHeadRequest: boolean,
  sourceOverride?: { url: string; mimeType: string; isGoogleVideo: boolean },
) => {
  let audio: ResolvedAudio = sourceOverride
    ? {
        videoId,
        title: '',
        uploader: '',
        duration: 0,
        directUrl: sourceOverride.url,
        mimeType: sourceOverride.mimeType,
        format: sourceOverride.mimeType.includes('webm') ? 'WEBM' : 'M4A',
        bitrate: 0,
        quality: '',
        instanceBase: sourceOverride.isGoogleVideo ? 'innertube' : 'provider-proxy',
        expiresAt: Date.now() + CACHE_TTL_MS,
      }
    : await resolveAudio(videoId);
  const range = req.headers.range;
  const createUpstreamRequest = async (resolved: ResolvedAudio) => {
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), STREAM_CONNECT_TIMEOUT_MS);
    try {
      // Clear the timeout as soon as headers arrive. The body remains a live
      // stream for the full song duration rather than being cut off at 15s.
      // URLs obtained through the iOS client expect an iOS-style request and
      // are most reliable when fetched with an explicit byte range.
      const viaInnertube = resolved.instanceBase === 'innertube';
      return await fetch(resolved.directUrl, {
        method: isHeadRequest ? 'HEAD' : 'GET',
        headers: viaInnertube
          ? {
              'User-Agent': 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
              Accept: '*/*',
              Range: range || 'bytes=0-',
            }
          : {
              'User-Agent': USER_AGENT,
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
  if (!sourceOverride && (upstream.status === 403 || upstream.status === 404 || upstream.status >= 500) && !req.destroyed) {
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

  let sourceOverride: { url: string; mimeType: string; isGoogleVideo: boolean } | undefined;
  const sourceParam = requestUrl.searchParams.get('source');
  if (shouldStream && sourceParam) {
    try {
      const source = new URL(sourceParam);
      const host = source.hostname.toLowerCase();
      const isGoogleVideo = host === 'googlevideo.com' || host.endsWith('.googlevideo.com');
      const configuredProviderHosts = [...getPipedInstances(), ...getInvidiousInstances()]
        .map((instance) => new URL(instance).hostname.toLowerCase());
      const isConfiguredProvider = configuredProviderHosts.some((providerHost) =>
        host === providerHost || host.endsWith(`.${providerHost}`),
      );
      const mimeType = (requestUrl.searchParams.get('mime') || 'audio/mp4').split(';')[0].trim().toLowerCase();
      if (source.protocol !== 'https:' || (!isGoogleVideo && !isConfiguredProvider) ||
          (!mimeType.startsWith('audio/') && mimeType !== 'application/octet-stream')) {
        sendJson(res, 400, { error: 'Invalid audio proxy source.' });
        return;
      }
      sourceOverride = { url: source.toString(), mimeType, isGoogleVideo };
    } catch {
      sendJson(res, 400, { error: 'Invalid audio proxy source URL.' });
      return;
    }
  }

  try {
    if (shouldStream) {
      await streamAudio(req, res, videoId, req.method === 'HEAD', sourceOverride);
      return;
    }

    const audio = await resolveAudio(videoId);
    const directHost = new URL(audio.directUrl).hostname.toLowerCase();
    const needsHeaderProxy = directHost.endsWith('googlevideo.com') || audio.instanceBase === 'innertube';
    const isGoogleVideo = directHost === 'googlevideo.com' || directHost.endsWith('.googlevideo.com');
    const configuredProviderHosts = [...getPipedInstances(), ...getInvidiousInstances()]
      .map((instance) => new URL(instance).hostname.toLowerCase());
    const canPinProxySource = isGoogleVideo || configuredProviderHosts.some((providerHost) =>
      directHost === providerHost || directHost.endsWith(`.${providerHost}`),
    );
    // Keep the exact signed URL for ranged proxy requests when the source is
    // from a trusted provider. This avoids re-resolving a different stream
    // between chunks and only permits configured provider/googlevideo hosts.
    const proxyStreamUrl = canPinProxySource
      ? `/api/youtube-audio?id=${encodeURIComponent(videoId)}&stream=1&source=${encodeURIComponent(audio.directUrl)}&mime=${encodeURIComponent(audio.mimeType)}`
      : `/api/youtube-audio?id=${encodeURIComponent(videoId)}&stream=1`;
    const streamUrl = needsHeaderProxy ? proxyStreamUrl : audio.directUrl;
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
