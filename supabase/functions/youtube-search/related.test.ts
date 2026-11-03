// Run with: node --experimental-strip-types --test related.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Candidate, artistKeys, cleanQueryText, genreFromTopics, genreMatches, isSameSong,
  joinQueryParts, normalizeTitle, parseISODuration, pickRelated, rankRelated, BAD_WORDS, WEIGHTS,
} from './related.ts';

const cand = (title: string, artist: string, extra: Partial<Candidate> = {}): Candidate => ({
  id: title + artist, title, artist, thumbnail: '', videoId: title + '|' + artist, duration: '3:00', ...extra,
});

test('weights add up to 1', () => {
  const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('normalizeTitle keeps real title words', () => {
  assert.equal(normalizeTitle('Shape of You (Official Video) [HD]'), 'shape of you');
  assert.equal(normalizeTitle('Video Games'), 'video games');
});

test('isSameSong: same song vs different songs', () => {
  assert.equal(isSameSong('Shape of You', 'Shape of You (Official Video)'), true);
  assert.equal(isSameSong('Shape of You', 'Shape of You Ed Sheeran'), true);
  assert.equal(isSameSong('Stay', 'Stayin Alive'), false);
  assert.equal(isSameSong('Love', 'Love Story'), false);
  assert.equal(isSameSong('Believe', 'Believer'), false);
});

test('BAD_WORDS blocks junk but not real song titles', () => {
  for (const t of ['Song (Cover)', 'Song cover by Sam', 'Song - Slowed + Reverb', 'Song (Official Remix)',
    'Hits Mix 2024', '1 Hour Mix', '2 hours of songs', 'Karaoke Version']) assert.equal(BAD_WORDS.test(t), true, t);
  for (const t of ['24 Hours', 'Chain Reaction', 'Cover Me', 'Under Cover', 'Mixed Emotions', 'Midnight Drive']) {
    assert.equal(BAD_WORDS.test(t), false, t);
  }
});

test('artistKeys', () => {
  assert.deepEqual(artistKeys('Tyler, The Creator'), ['tyler the creator']);
  assert.deepEqual(artistKeys('AC/DC'), ['ac dc']);
  assert.deepEqual(artistKeys('Dua Lipa feat. Elton John'), ['dua lipa', 'elton john']);
  assert.deepEqual(artistKeys('Arijit Singh - Topic'), ['arijit singh']);
  assert.deepEqual(artistKeys('T-Series'), []);
  assert.deepEqual(artistKeys('Zee Music Company'), []);
});

test('genre helpers', () => {
  assert.equal(genreFromTopics(['https://en.wikipedia.org/wiki/Music', 'https://en.wikipedia.org/wiki/Hip_hop_music']), 'Hip hop');
  assert.equal(genreFromTopics(['https://en.wikipedia.org/wiki/Music_of_Asia']), null);
  assert.equal(genreMatches('Hip hop', ['hip-hop']), true);
  assert.equal(genreMatches('Jazz', ['rock']), false);
});

test('parseISODuration', () => {
  assert.equal(parseISODuration('PT3M42S'), 222);
  assert.equal(parseISODuration('PT1H2M'), 3720);
  assert.equal(parseISODuration('garbage'), 0);
});

test('relevance never goes negative when many results were filtered out', () => {
  const items = [cand('A', 'x', { relevanceRank: 40 }), cand('B', 'y', { relevanceRank: 2 }),
    cand('C', 'z', { relevanceRank: 30 }), cand('D', 'w', { relevanceRank: 10 })];
  const ranked = rankRelated(items);
  assert.equal(ranked[0].title, 'B'); // best search rank wins when all else is equal
});

test('Last.fm similarity beats raw popularity', () => {
  const items = [
    cand('Viral Hit', 'a', { relevanceRank: 1, viewCount: 9e8, viewsPerDay: 9e6, lastFmMatch: 0.05 }),
    cand('Similar Song', 'b', { relevanceRank: 1, viewCount: 1e6, viewsPerDay: 1e3, lastFmMatch: 1 }),
    cand('Other 1', 'c', { relevanceRank: 1, viewCount: 5e5, viewsPerDay: 500, lastFmMatch: 0.1 }),
    cand('Other 2', 'd', { relevanceRank: 1, viewCount: 4e5, viewsPerDay: 400, lastFmMatch: 0.1 }),
  ];
  assert.equal(rankRelated(items)[0].title, 'Similar Song');
});

test('pickRelated: no covers (even after Last.fm renamed the title), no same song, one per artist', () => {
  const out = pickRelated([
    cand('Blinding Lights', 'Somebody', { rawTitle: 'Blinding Lights (Cover) - The Weeknd' }),
    cand('Blinding Lights', 'Other Channel'),
    cand('Save Your Tears', 'The Weeknd'),
    cand('Levitating', 'Dua Lipa'),
    cand('Levitating Remix', 'Dua Lipa'),
    cand('Peaches', 'Justin Bieber'),
    cand('Hours Mix 2024', 'DJ Someone'),
    cand('Stay', 'The Kid LAROI'),
    cand('Stay', 'Rihanna'),
    cand('Song From Label', 'T-Series'),
    cand('Another From Label', 'T-Series'),
  ], { currentTitle: 'Blinding Lights', currentArtist: 'The Weeknd' });
  const titles = out.map((c) => c.title + ' / ' + c.artist);
  assert.ok(!titles.some((t) => t.startsWith('Blinding Lights')), 'same song/cover removed');
  assert.ok(!titles.some((t) => t.includes('The Weeknd')), 'current artist skipped');
  assert.ok(!titles.some((t) => t.startsWith('Hours Mix')), 'mix removed');
  assert.equal(titles.filter((t) => t.includes('Dua Lipa')).length, 1, 'one per artist');
  assert.equal(titles.filter((t) => t.startsWith('Stay')).length, 1, 'no duplicate title');
  assert.equal(titles.filter((t) => t.includes('T-Series')).length, 2, 'labels are not artists');
});

test('pickRelated: only the most recent artists are blocked', () => {
  const old = Array.from({ length: 12 }, (_, i) => 'Artist ' + String.fromCharCode(65 + i));
  const out = pickRelated(
    [cand('Song One', 'Artist A'), cand('Song Two', 'Artist L')],
    { currentTitle: 'x', currentArtist: 'y', excludeArtists: old },
  );
  assert.deepEqual(out.map((c) => c.artist), ['Artist A'], 'old artist allowed again, recent one blocked');
});

test('query helpers never cut a part in the middle', () => {
  const q = joinQueryParts(['"aaaa" bbbb', 'x'.repeat(300), 'short part'], 60);
  assert.equal(q, '"aaaa" bbbb | short part');
  assert.equal(cleanQueryText(`"Don't" (Stop) | T-Series -remix`, 80), 'Don t Stop T-Series remix');
});
