/**
 * GET /v1/meta?since=<timestamp>
 *
 * Serve o meta.json produzido pelo enrich.js (em /opt/iptv-meta/meta.json).
 * Integrado no backend StreamVPN — sem serviço separado, sem porta extra.
 *
 * Respostas:
 *   304  — nada mudou desde o timestamp pedido
 *   200  — JSON gzipado com { updated_at, items: { [key]: {...} } }
 *         (apenas items com fetchedAt > since, sem falhas)
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');

const META_FILE = process.env.META_FILE || '/opt/iptv-meta/meta.json';

let cache    = { updated_at: 0, items: {} };
let fileMtime = 0;

function reload() {
  try {
    const st = fs.statSync(META_FILE);
    if (st.mtimeMs === fileMtime) return;
    cache     = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    fileMtime = st.mtimeMs;
    console.log(`[meta] recarregado: ${Object.keys(cache.items || {}).length} títulos`);
  } catch (e) { /* enrich.js ainda não correu */ }
}

reload();
setInterval(reload, 60_000);

router.get('/', (req, res) => {
  reload();
  const since = Number(req.query.since || 0);

  if (since && cache.updated_at <= since) {
    return res.sendStatus(304);
  }

  const items = {};
  for (const [k, v] of Object.entries(cache.items || {})) {
    if (v.failed) continue;
    if (since && v.fetchedAt <= since) continue;
    items[k] = v;
  }

  const body = JSON.stringify({ updated_at: cache.updated_at, items });
  const gz   = zlib.gzipSync(body);

  res.writeHead(200, {
    'Content-Type'     : 'application/json; charset=utf-8',
    'Content-Encoding' : 'gzip',
    'Cache-Control'    : 'public, max-age=3600',
  });
  res.end(gz);
});

module.exports = router;
