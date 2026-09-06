#!/usr/bin/env node
/*
 * Enriquecimento de metadados: le a playlist, limpa os titulos, pergunta ao
 * TMDB e guarda em meta.json. Idempotente: o que ja esta em cache nao e
 * pedido outra vez.
 *
 *   export TMDB_KEY=...
 *   export PLAYLIST_URL="http://.../get.php?...&type=m3u_plus"
 *   node enrich.js
 */

const fs = require('fs');
const path = require('path');

const KEY = process.env.TMDB_KEY;
const PLAYLIST = process.env.PLAYLIST_URL;
const OUT = path.join(__dirname, 'meta.json');
const FAILS = path.join(__dirname, 'falhas.txt');

const TTL_OK = 30 * 24 * 3600 * 1000;   // metadados validos 30 dias
const TTL_FAIL = 30 * 24 * 3600 * 1000; // nao repetir falhas durante 30 dias
const CONCURRENCY = 4;                   // respeitar o limite de taxa
const API = 'https://api.themoviedb.org/3';

if (!KEY || !PLAYLIST) {
  console.error('Falta TMDB_KEY ou PLAYLIST_URL. Ver README.md');
  process.exit(1);
}

/* ---------- limpeza do titulo ---------- */

const RE_PREFIX = /^\s*(PT|BR|EN|ES|VOD|FILME|FILMES|SERIE|SERIES)\s*[|:\-]\s*/i;
const RE_YEAR   = /\((19|20)\d{2}\)|\b(19|20)\d{2}\b/;
const RE_TAGS   = /\[?\b(4K|UHD|FHD|1080p?|720p?|480p?|HD|SD|DUAL|MULTI|LEG|LEGENDADO|DUB|DUBLADO|IMAX|EXTENDED|REMUX|WEB-?DL|BLURAY)\b\]?/gi;
const RE_EXT    = /\.(mkv|mp4|avi|ts|m4v)$/i;
const RE_EP     = /\b(?:S(\d{1,2})[\s._-]?E(\d{1,3})|(\d{1,2})x(\d{1,3})|T(\d{1,2})\s*Ep?\.?\s*(\d{1,3}))\b/i;

function parseTitle(raw) {
  let s = String(raw || '').trim();

  // episodio: extrair ANTES de limpar; a busca e pela serie, nao pelo episodio
  const ep = s.match(RE_EP);
  let season = null, episode = null;
  if (ep) {
    season  = Number(ep[1] || ep[3] || ep[5]) || null;
    episode = Number(ep[2] || ep[4] || ep[6]) || null;
    s = s.replace(RE_EP, ' ');
  }

  const ym = s.match(RE_YEAR);
  const year = ym ? Number(ym[0].replace(/[()]/g, '')) : null;

  s = s.replace(RE_EXT, ' ')
       .replace(RE_PREFIX, '')
       .replace(RE_YEAR, ' ')
       .replace(RE_TAGS, ' ')
       .replace(/[._]+/g, ' ')
       .replace(/[\[\](){}]/g, ' ')
       .replace(/\s{2,}/g, ' ')
       .trim();

  return { title: s, year, season, episode, isSeries: season !== null };
}

const norm = t => String(t || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, '')
  .replace(/\s{2,}/g, ' ')
  .trim();

/** 0..1 — Dice sobre bigramas. Simples e suficiente para titulos. */
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bi = s => { const o = new Set(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o; };
  const A = bi(a), B = bi(b);
  let hit = 0; for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}

const keyOf = p => norm(p.title) + '|' + (p.year || '') + (p.isSeries ? '|tv' : '');

/* ---------- playlist ---------- */

async function readPlaylist(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'IPTVGlobal-enrich/1' } });
  if (!res.ok) throw new Error('playlist HTTP ' + res.status);
  const text = await res.text();

  const out = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('#EXTINF')) continue;
    const group = (line.match(/group-title="([^"]*)"/i) || [])[1] || '';
    const name = line.split(',').slice(1).join(',').trim();
    if (!name) continue;
    // canais ao vivo nao levam metadados de filme
    if (/^(canais|tv|live|desporto|noticias|generalistas|radio)/i.test(group)) continue;
    out.push({ name, group });
  }
  return out;
}

/* ---------- TMDB ---------- */

async function tmdb(pathname, params) {
  const qs = new URLSearchParams({ api_key: KEY, ...params });
  const res = await fetch(API + pathname + '?' + qs, { headers: { Accept: 'application/json' } });
  if (res.status === 429) { const e = new Error('rate limit'); e.rate = true; throw e; }
  if (!res.ok) throw new Error('tmdb HTTP ' + res.status);
  return res.json();
}

/** Aceita so com ano coincidente (+-1) e titulo semelhante. Ambiguo -> nada. */
async function lookup(p) {
  const kind = p.isSeries ? '/search/tv' : '/search/movie';
  const params = { query: p.title, language: 'pt-PT', include_adult: 'false' };
  if (p.year) params[p.isSeries ? 'first_air_date_year' : 'year'] = String(p.year);

  let r = await tmdb(kind, params);
  if (!r.results?.length) r = await tmdb(kind, { query: p.title, language: 'en-US', include_adult: 'false' });
  if (!r.results?.length) return null;

  const scored = r.results.map(x => {
    const title = x.title || x.name || '';
    const date = x.release_date || x.first_air_date || '';
    const y = date ? Number(date.slice(0, 4)) : null;
    let score = similarity(p.title, title);
    if (p.year && y) score += Math.abs(y - p.year) <= 1 ? 0.25 : -0.5;
    return { x, y, title, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.62) return null;
  // ambiguo: dois candidatos igualmente plausiveis -> nao escolhe nenhum
  if (scored[1] && best.score - scored[1].score < 0.08) return null;

  const d = best.x;
  return {
    tmdbId: d.id,
    kind: p.isSeries ? 'tv' : 'movie',
    title: best.title,
    year: best.y,
    overview: (d.overview || '').trim() || null,
    posterPath: d.poster_path || null,     // caminho relativo, nao URL
    backdropPath: d.backdrop_path || null, // sem isto as filas nao funcionam
    rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null
  };
}

/* ---------- principal ---------- */

(async () => {
  const now = Date.now();
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(OUT, 'utf8')).items || {}; } catch (e) {}

  const items = await readPlaylist(PLAYLIST);
  const parsed = items.map(i => ({ ...parseTitle(i.name), raw: i.name, group: i.group }))
                      .filter(p => p.title.length >= 2);

  // deduplicar: um pedido por titulo, nao por ficheiro
  const todo = new Map();
  for (const p of parsed) {
    const k = keyOf(p);
    const c = cache[k];
    if (c && !c.failed && now - c.fetchedAt < TTL_OK) continue;
    if (c && c.failed && now - c.fetchedAt < TTL_FAIL) continue;
    if (!todo.has(k)) todo.set(k, p);
  }

  console.log('lidos ' + parsed.length + ' · a pedir ' + todo.size + ' · em cache ' + Object.keys(cache).length);

  const queue = [...todo.entries()];
  const fails = [];
  let done = 0, ok = 0, stopped = false;

  async function worker() {
    while (queue.length && !stopped) {
      const [k, p] = queue.shift();
      try {
        const meta = await lookup(p);
        if (meta) { cache[k] = { ...meta, fetchedAt: Date.now(), failed: false }; ok++; }
        else { cache[k] = { fetchedAt: Date.now(), failed: true }; fails.push(p.raw); }
      } catch (e) {
        if (e.rate) { stopped = true; console.warn('limite de taxa — parar e tentar amanha'); break; }
        cache[k] = { fetchedAt: Date.now(), failed: true }; fails.push(p.raw + '  (' + e.message + ')');
      }
      if (++done % 50 === 0) console.log('  ' + done + '/' + todo.size);
      await new Promise(r => setTimeout(r, 60)); // gentil com a API
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(OUT, JSON.stringify({ updated_at: Date.now(), items: cache }));
  if (fails.length) fs.writeFileSync(FAILS, fails.join('\n') + '\n');

  console.log('novos ' + ok + ' · sem correspondencia ' + fails.length +
              (fails.length ? ' (ver falhas.txt)' : ''));
})().catch(e => { console.error('erro:', e.message); process.exit(1); });
