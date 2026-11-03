import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  type Candidate,
  cleanQueryText,
  formatDuration,
  genreFromTopics,
  genreMatches,
  inferVibeTerms,
  isSameSong,
  joinQueryParts,
  langFromCode,
  normalizeTitle,
  parseISODuration,
  pickRelated,
  UNMATCHED_LASTFM_SCORE,
} from "./related.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    // "related" mode = next songs of the same genre/vibe (YouTube-style Up Next)
    if (body?.related) return await handleRelated(body.related)
    return await handleSearch(body?.query)
  } catch (error) {
    console.error('Error in youtube-search function:', error)
    return jsonResponse(
      { error: 'Internal server error', message: error instanceof Error ? error.message : String(error) },
      500,
    )
  }
})

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------
const YT_API = 'https://www.googleapis.com/youtube/v3'

class YouTubeApiError extends Error {
  status: number
  reason?: string
  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

const ytFetch = async (
  path: 'search' | 'videos',
  params: Record<string, string>,
  timeoutMs = 7000,
): Promise<any> => {
  const url = `${YT_API}/${path}?${new URLSearchParams(params).toString()}`
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new YouTubeApiError(
      data?.error?.message || `YouTube API error ${response.status}`,
      response.status,
      data?.error?.errors?.[0]?.reason,
    )
  }
  return await response.json()
}

const parseYouTubeTrackTitle = (rawTitle: string, channelTitle: string) => {
  let artist = channelTitle || 'Unknown Artist'
  let title = rawTitle || 'Unknown Track'
  const separator = [' - ', ' – ', ' — '].find((value) => title.includes(value))
  if (separator) {
    const parts = title.split(separator)
    if (parts.length >= 2) {
      artist = parts[0].trim()
      title = parts.slice(1).join(separator).trim()
    }
  }
  return { title, artist }
}

/** Display only: "Levitating (Official Audio)" -> "Levitating", "Dua Lipa - Topic" -> "Dua Lipa". */
const tidyDisplay = (title: string, artist: string) => ({
  title:
    title
      .replace(/\s*[\(\[][^\)\]]*\b(official|lyrics?|lyrical|audio|video|hd|4k|visualizer)\b[^\)\]]*[\)\]]\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || title,
  artist: artist.replace(/\s*-\s*topic$/i, '').trim() || artist,
})

const bestThumbnail = (item: any): string =>
  item?.snippet?.thumbnails?.high?.url ||
  item?.snippet?.thumbnails?.medium?.url ||
  item?.snippet?.thumbnails?.default?.url ||
  ''

// ---------------------------------------------------------------------------
// Plain search (unchanged behaviour: { query } -> { tracks })
// ---------------------------------------------------------------------------
async function handleSearch(query: unknown) {
  if (!query || typeof query !== 'string') {
    return jsonResponse({ error: 'Query parameter is required and must be a string' }, 400)
  }
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) {
    console.error('YouTube API key not found')
    return jsonResponse({ error: 'YouTube API key not configured' }, 500)
  }

  try {
    const data = await ytFetch('search', {
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10',
      maxResults: '20',
      q: query,
      key: apiKey,
    })
    const tracks = (data.items || []).map((item: any) => {
      const { title, artist } = parseYouTubeTrackTitle(item.snippet.title, item.snippet.channelTitle)
      return {
        id: item.id.videoId,
        title,
        artist,
        thumbnail: bestThumbnail(item),
        videoId: item.id.videoId,
        duration: 'Unknown', // search results do not include duration
      }
    })
    return jsonResponse({ tracks })
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      console.error('YouTube API error:', error.status, error.message)
      return jsonResponse(
        { error: 'Failed to search YouTube', details: error.message, code: error.reason },
        error.status,
      )
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Last.fm: track-to-track similarity, tags and MusicBrainz ids
// ---------------------------------------------------------------------------
interface LastFmTrack {
  title: string
  artist: string
  match: number // 0..1
  musicBrainzId?: string
}

interface LastFmResult {
  tracks: LastFmTrack[]
  tags: string[]
}

const toArray = (value: any): any[] => (Array.isArray(value) ? value : value ? [value] : [])

const lastFmJson = async (params: Record<string, string>): Promise<any | null> => {
  try {
    const response = await fetch('https://ws.audioscrobbler.com/2.0/?' + new URLSearchParams(params).toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    })
    if (!response.ok) return null
    const data = await response.json()
    if (data?.error) {
      // Last.fm may return API errors with HTTP 200.
      console.warn('Last.fm API response error:', data.message || data.error)
      return null
    }
    return data
  } catch (error) {
    console.warn('Last.fm request failed:', error)
    return null
  }
}

const getLastFmRecommendations = async (title: string, artist: string): Promise<LastFmResult> => {
  const apiKey = Deno.env.get('LASTFM_API_KEY')
  if (!apiKey) return { tracks: [], tags: [] }

  const base = { api_key: apiKey, format: 'json', autocorrect: '1' }
  const lookup = (a: string, t: string) =>
    Promise.all([
      lastFmJson({ ...base, method: 'track.getSimilar', artist: a, track: t, limit: '35' }),
      lastFmJson({ ...base, method: 'track.getTopTags', artist: a, track: t }),
    ])

  let [similarData, tagData] = await lookup(artist, title)

  // YouTube channels often expose a label rather than the real performer. If
  // the first lookup finds nothing, resolve the track by title and retry with
  // its canonical artist.
  if (toArray(similarData?.similartracks?.track).length === 0) {
    const searchData = await lastFmJson({ ...base, method: 'track.search', track: title, limit: '5' })
    const canonical = toArray(searchData?.results?.trackmatches?.track).find(
      (item: any) => item?.name && item?.artist && isSameSong(String(item.name), title),
    )
    const canonicalArtist = String(canonical?.artist || '').trim()
    const canonicalTitle = String(canonical?.name || '').trim()
    if (canonicalArtist && canonicalTitle) {
      ;[similarData, tagData] = await lookup(canonicalArtist, canonicalTitle)
    }
  }

  const rawTracks = toArray(similarData?.similartracks?.track)
  const numericMatches = rawTracks
    .map((item: any) => Number(item?.match))
    .filter((value: number) => Number.isFinite(value) && value > 0)
  // Normalise against this response's best match so relative similarity is kept.
  const maxMatch = Math.max(1, ...numericMatches)

  const tracks: LastFmTrack[] = []
  const seen = new Set<string>()
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  for (const item of rawTracks) {
    const trackTitle = String(item?.name || '').trim()
    const trackArtist = String(item?.artist?.name || '').trim()
    if (!trackTitle || !trackArtist) continue

    const mbid = String(item?.mbid || '').trim()
    const musicBrainzId = uuid.test(mbid) ? mbid : undefined
    const key = musicBrainzId || normalizeTitle(trackTitle) + '|' + normalizeTitle(trackArtist)
    if (seen.has(key)) continue
    seen.add(key)

    const match = Number(item?.match)
    tracks.push({
      title: trackTitle,
      artist: trackArtist,
      match: Number.isFinite(match) ? Math.max(0, Math.min(1, match / maxMatch)) : 0.25,
      musicBrainzId,
    })
  }

  const tags = toArray(tagData?.toptags?.tag)
    .map((tag: any) => String(tag?.name || '').trim())
    .filter((tag: string) => tag.length >= 2 && tag.length <= 32)
    .filter((tag: string) => !/^(seen live|favorites?|favourites?|awesome|spotify|all)$/i.test(tag))
    .slice(0, 5)

  return { tracks: tracks.slice(0, 35), tags }
}

// ---------------------------------------------------------------------------
// Related songs ("Up next")
// ---------------------------------------------------------------------------
interface RelatedRequest {
  videoId: string
  title: string
  artist: string
  language: string
  languageCode: string
  genres: string[]
  excludeTitles: string[]
  excludeVideoIds: string[]
  excludeArtists: string[] // play order, oldest first
  excludeMusicBrainzIds: string[]
  musicBrainzId?: string
  limit: number
}

/** Validate and size-limit the client input (the function is publicly callable). */
const readRelatedRequest = (raw: any): RelatedRequest | null => {
  const str = (value: unknown, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const list = (value: unknown, max: number, len = 150): string[] =>
    Array.isArray(value)
      ? value.filter((v) => typeof v === 'string').slice(-max).map((v: string) => v.slice(0, len))
      : []

  const videoId = str(raw?.videoId, 20)
  const title = str(raw?.title)
  const artist = str(raw?.artist)
  if (!videoId || !title || !artist) return null

  return {
    videoId,
    title,
    artist,
    language: str(raw?.language, 40),
    languageCode: str(raw?.languageCode, 10).toLowerCase(),
    genres: list(raw?.genres, 6, 40),
    excludeTitles: list(raw?.excludeTitles, 200),
    excludeVideoIds: list(raw?.excludeVideoIds, 200, 20),
    excludeArtists: list(raw?.excludeArtists, 40),
    excludeMusicBrainzIds: list(raw?.excludeMusicBrainzIds, 200, 40),
    musicBrainzId: str(raw?.musicBrainzId, 40) || undefined,
    limit: Math.max(1, Math.min(25, Number(raw?.limit) || 15)),
  }
}

/** Everything expensive (YouTube search + details + Last.fm), cached per seed song. */
interface Bundle {
  candidates: Candidate[]
  genre: string
  language: string
  vibe: string[]
  tags: string[]
  similarCount: number
}

const BUNDLE_TTL_MS = 15 * 60 * 1000
const BUNDLE_MAX = 100
const bundleCache = new Map<string, { at: number; bundle: Bundle }>()

const readSeedMetadata = async (videoId: string, apiKey: string) => {
  const empty = { genre: null as string | null, language: null as string | null, tags: [] as string[] }
  try {
    const data = await ytFetch(
      'videos',
      { part: 'snippet,topicDetails', id: videoId, key: apiKey },
      5000,
    )
    const video = data.items?.[0]
    return {
      genre: genreFromTopics(video?.topicDetails?.topicCategories || []),
      language: langFromCode(video?.snippet?.defaultAudioLanguage || video?.snippet?.defaultLanguage),
      tags: Array.isArray(video?.snippet?.tags) ? (video.snippet.tags as string[]) : [],
    }
  } catch (error) {
    if (error instanceof YouTubeApiError && error.reason === 'quotaExceeded') throw error
    console.warn('Seed video metadata lookup failed:', error)
    return empty
  }
}

const buildBundle = async (rel: RelatedRequest, apiKey: string): Promise<Bundle> => {
  // 1) Seed metadata (YouTube) and similar songs (Last.fm) in parallel
  const [seed, lastFm] = await Promise.all([
    readSeedMetadata(rel.videoId, apiKey),
    getLastFmRecommendations(rel.title, rel.artist),
  ])

  const similarTracks = lastFm.tracks
  const language = seed.language || rel.language || ''
  const genreWord = seed.genre || rel.genres[0] || lastFm.tags[0] || 'popular music'
  const seedText = (rel.title + ' ' + rel.artist).toLowerCase()
  const vibeTerms = inferVibeTerms([rel.title, rel.artist, ...seed.tags, ...lastFm.tags].join(' '))

  const styleTags = [...lastFm.tags, ...seed.tags]
    .map((tag) => tag.trim())
    .filter((tag) => {
      const value = tag.toLowerCase()
      return value.length >= 3 && value.length <= 28 && !seedText.includes(value) &&
        !/\b(official|video|audio|lyrics?|hd|4k|music|song|full|remastered)\b/i.test(value)
    })
    .filter((tag, i, all) => all.findIndex((v) => v.toLowerCase() === tag.toLowerCase()) === i)
    .slice(0, 3)

  // 2) ONE YouTube search. Short exact-song queries from Last.fm are OR-ed with
  //    genre/vibe queries. The seed title/artist are deliberately NOT used in
  //    the fallback queries, otherwise YouTube returns re-uploads of the same song.
  const exclusions = '-cover -karaoke -instrumental -reaction -compilation -mashup -slowed -nightcore'
  const lastFmQueries = similarTracks
    .slice(0, 6)
    .map((t) => `"${cleanQueryText(t.title, 40)}" ${cleanQueryText(t.artist, 30)} official audio`)
  const genreQuery = [genreWord, vibeTerms[0] || '', language, ...styleTags, 'songs'].filter(Boolean).join(' ')
  const trendingQuery = [genreWord, vibeTerms[0] || '', language, 'viral trending popular hits']
    .filter(Boolean)
    .join(' ')

  const query =
    joinQueryParts(
      [...lastFmQueries.slice(0, 3), genreQuery, trendingQuery, ...lastFmQueries.slice(3)],
      480 - exclusions.length - 1,
    ) +
    ' ' +
    exclusions
  console.log(
    `Up Next: ${similarTracks.length ? 'Last.fm + YouTube' : 'YouTube only'} | genre=${genreWord} | lang=${language}`,
  )

  const searchParams: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    videoEmbeddable: 'true',
    maxResults: '50',
    order: 'relevance',
    safeSearch: 'moderate',
    q: query,
    key: apiKey,
  }
  if (/^[a-z]{2}$/.test(rel.languageCode)) searchParams.relevanceLanguage = rel.languageCode

  const searchData = await ytFetch('search', searchParams)
  const searchItems = (searchData.items || []).filter(
    (item: any) => item?.id?.videoId && item.id.videoId !== rel.videoId,
  )
  const ids: string[] = searchItems.map((item: any) => item.id.videoId)

  // 3) Duration, views, likes, description, topics for all results (1 call)
  const detailsById = new Map<string, any>()
  if (ids.length) {
    try {
      const details = await ytFetch('videos', {
        part: 'contentDetails,statistics,snippet,topicDetails',
        id: ids.join(','),
        key: apiKey,
      })
      for (const video of details.items || []) detailsById.set(video.id, video)
    } catch (error) {
      if (error instanceof YouTubeApiError && error.reason === 'quotaExceeded') throw error
      console.warn('Video details lookup failed:', error)
    }
  }

  // 4) Turn results into scored candidates
  const now = Date.now()
  const preferredGenres = [seed.genre, ...rel.genres, ...lastFm.tags].filter(Boolean).map(String)
  const candidates: Candidate[] = []

  searchItems.forEach((item: any, relevanceRank: number) => {
    const videoId: string = item.id.videoId
    const details = detailsById.get(videoId)
    const seconds = parseISODuration(details?.contentDetails?.duration || '')
    if (details && seconds > 0 && (seconds < 60 || seconds > 600)) return // skip shorts and long mixes

    const rawTitle = String(item.snippet?.title || 'Unknown Track')
    const channelTitle = String(item.snippet?.channelTitle || 'Unknown Artist')
    const parsed = parseYouTubeTrackTitle(rawTitle, channelTitle)
    const normalizedTitle = normalizeTitle(parsed.title)
    const normalizedRaw = normalizeTitle(rawTitle)
    const artistHaystack = (rawTitle + ' ' + channelTitle).toLowerCase()

    // Match against Last.fm results. A title match alone is too ambiguous
    // (e.g. "Stay"), so the artist name must also appear in the title/channel.
    let matched: LastFmTrack | undefined
    let matchedScore = 0
    for (const track of similarTracks) {
      const trackTitle = normalizeTitle(track.title)
      const titleMatches =
        isSameSong(track.title, parsed.title) ||
        (normalizedTitle.length >= 4 && normalizedTitle === trackTitle) ||
        (normalizedRaw.length >= 4 && normalizedRaw === trackTitle)
      if (!titleMatches || !artistHaystack.includes(track.artist.toLowerCase())) continue
      if (track.match > matchedScore) {
        matchedScore = track.match
        matched = track
      }
    }

    // Show Last.fm's clean title/artist when the song is recognised, but keep
    // this YouTube video id. rawTitle is kept so filters still see "cover" etc.
    const tidy = tidyDisplay(parsed.title, parsed.artist)
    const title = matched?.title || tidy.title
    const artist = matched?.artist || tidy.artist

    const statistics = details?.statistics || {}
    const views = Number(statistics.viewCount || 0)
    const likes = Number(statistics.likeCount || 0)
    const publishedTime = Date.parse(details?.snippet?.publishedAt || item.snippet?.publishedAt || '')
    const ageDays = Number.isFinite(publishedTime) ? Math.max(1, (now - publishedTime) / 86400000) : 30

    const candidateGenre = genreFromTopics(details?.topicDetails?.topicCategories || [])
    const genreMatch = !candidateGenre || preferredGenres.length === 0
      ? 0.5
      : genreMatches(candidateGenre, preferredGenres) ? 1 : 0.2

    const candidateText = [title, artist, String(details?.snippet?.description || ''), ...(details?.snippet?.tags || [])]
      .join(' ')
    const candidateVibes = inferVibeTerms(candidateText)
    const vibeMatch = vibeTerms.length === 0 ? 0.5 : candidateVibes.some((v) => vibeTerms.includes(v)) ? 1 : 0.25

    const channelLower = channelTitle.toLowerCase()
    const officialSignal =
      /\btopic$/.test(channelLower) ||
      /\b(vevo|official)\b/.test(channelLower) ||
      /\b(official audio|official music video)\b/i.test(rawTitle) ||
      /provided to youtube by|licensed to youtube by/i.test(String(details?.snippet?.description || ''))
        ? 1
        : 0.2

    candidates.push({
      id: videoId,
      title,
      artist,
      rawTitle,
      thumbnail: bestThumbnail(item),
      videoId,
      duration: seconds ? formatDuration(seconds) : 'Unknown',
      relevanceRank,
      viewCount: views,
      viewsPerDay: views / ageDays,
      likeRatio: views > 0 ? likes / views : 0,
      genreMatch,
      vibeMatch,
      lastFmMatch: matched ? matchedScore : UNMATCHED_LASTFM_SCORE,
      musicBrainzId: matched?.musicBrainzId,
      officialSignal,
    })
  })

  return {
    candidates,
    genre: seed.genre || genreWord,
    language,
    vibe: vibeTerms,
    tags: lastFm.tags,
    similarCount: similarTracks.length,
  }
}

async function handleRelated(raw: unknown) {
  const rel = readRelatedRequest(raw)
  if (!rel) return jsonResponse({ error: 'videoId, title and artist are required' }, 400)

  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return jsonResponse({ error: 'YouTube API key not configured' }, 500)

  // Cache the expensive part per seed song. De-duplication below still runs on
  // every call, so the queue never repeats songs.
  const cacheKey = `${rel.videoId}|${rel.languageCode}|${rel.genres[0] || ''}`
  const cached = bundleCache.get(cacheKey)
  let bundle: Bundle
  if (cached && Date.now() - cached.at < BUNDLE_TTL_MS) {
    bundle = cached.bundle
  } else {
    try {
      bundle = await buildBundle(rel, apiKey)
    } catch (error) {
      if (error instanceof YouTubeApiError) {
        if (error.reason === 'quotaExceeded' || error.reason === 'dailyLimitExceeded') {
          return jsonResponse({ error: 'YouTube quota exceeded', code: 'quota_exceeded' }, 429)
        }
        return jsonResponse(
          { error: 'Failed to search similar songs', details: error.message, code: error.reason },
          error.status,
        )
      }
      throw error
    }
    if (bundleCache.size >= BUNDLE_MAX) bundleCache.delete(bundleCache.keys().next().value as string)
    bundleCache.set(cacheKey, { at: Date.now(), bundle })
  }

  const selected = pickRelated(bundle.candidates, {
    currentTitle: rel.title,
    currentArtist: rel.artist,
    excludeTitles: rel.excludeTitles,
    excludeVideoIds: [rel.videoId, ...rel.excludeVideoIds],
    excludeArtists: rel.excludeArtists,
    excludeMusicBrainzIds: [rel.musicBrainzId || '', ...rel.excludeMusicBrainzIds].filter(Boolean),
    limit: rel.limit,
  })

  const tracks = selected.map(({ id, title, artist, thumbnail, videoId, duration, musicBrainzId }) => ({
    id, title, artist, thumbnail, videoId, duration, musicBrainzId,
  }))

  return jsonResponse({
    tracks,
    genre: bundle.genre,
    language: bundle.language,
    vibe: bundle.vibe,
    tags: bundle.tags,
    recommendationSource: bundle.similarCount ? 'lastfm-track-similarity' : 'youtube-fallback',
    lastFmSimilarCount: bundle.similarCount,
    musicBrainzIdsMatched: selected.filter((t) => Boolean(t.musicBrainzId)).length,
    cached: Boolean(cached && bundle === cached.bundle),
  })
}