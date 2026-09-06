/**
 * Sync de favoritos, progresso e recentes entre dispositivos.
 * Chave: SHA-256(username + ':' + password) calculado no dispositivo (SyncManager.kt).
 * Sem autenticação própria — só quem conhece as credenciais consegue calcular o hash.
 */
const express = require('express');
const router = express.Router();
const Sync = require('../models/Sync');

// GET /api/sync/:hash  → { favorites, progress, recent }
router.get('/:hash', async (req, res) => {
  try {
    const doc = await Sync.findOne({ hash: req.params.hash }).lean();
    if (!doc) return res.json({ favorites: [], progress: [], recent: [] });
    res.json({ favorites: doc.favorites, progress: doc.progress, recent: doc.recent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/sync/:hash  { favorites, progress, recent }  → { ok: true }
router.post('/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const { favorites, progress, recent } = req.body || {};
    await Sync.findOneAndUpdate(
      { hash },
      { hash, favorites: favorites ?? [], progress: progress ?? [], recent: recent ?? [], updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
