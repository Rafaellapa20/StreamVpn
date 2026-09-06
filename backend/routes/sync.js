/**
 * Sync de favoritos, progresso e recentes entre dispositivos.
 *
 * Rotas de identificação (devem vir ANTES de /:id para não serem interceptadas):
 *   POST /api/sync/id    { credHash } → { syncId }   (cria se não existir)
 *   POST /api/sync/rekey { oldCredHash, newCredHash } → { syncId }
 *
 * Rotas de dados (identificadas pelo syncId devolvido acima):
 *   GET  /api/sync/:id → { favorites, favorites_removed, progress, recent }
 *   POST /api/sync/:id  { favorites, favorites_removed, progress, recent } → { ok: true }
 *
 * Compatibilidade com clientes antigos (hash SHA-256 direto):
 *   GET/POST /:id também funciona com o hash legado (campo "hash" no documento).
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const Sync    = require('../models/Sync');

/* ─── helpers ─────────────────────────────────────────────────────── */

/** Encontra um documento por syncId (novo) ou hash legado (antigo). */
async function findByAny(id) {
  return Sync.findOne({ $or: [{ syncId: id }, { hash: id }] });
}

/* ─── POST /id ─────────────────────────────────────────────────────── */

// Devolve (ou cria) o syncId para um credHash.
// O app chama isto uma vez por conta e guarda o resultado cifrado.
router.post('/id', async (req, res) => {
  try {
    const { credHash } = req.body || {};
    if (!credHash || typeof credHash !== 'string' || credHash.length < 32) {
      return res.status(400).json({ error: 'credHash inválido' });
    }

    // Procura por hash (novo campo) OU pelo syncId igual ao hash (migração)
    let doc = await Sync.findOne({ hash: credHash });
    if (!doc) {
      const syncId = crypto.randomBytes(16).toString('hex'); // 32 chars hex
      doc = await Sync.create({ syncId, hash: credHash });
    } else if (!doc.syncId) {
      // Documento antigo sem syncId: atribui um agora
      doc.syncId = crypto.randomBytes(16).toString('hex');
      await doc.save();
    }

    res.json({ syncId: doc.syncId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── POST /rekey ──────────────────────────────────────────────────── */

// Muda o credHash de um syncId quando a password muda.
// O histório de sync mantém-se — só o hash de acesso muda.
router.post('/rekey', async (req, res) => {
  try {
    const { oldCredHash, newCredHash } = req.body || {};
    if (!oldCredHash || !newCredHash) {
      return res.status(400).json({ error: 'oldCredHash e newCredHash obrigatórios' });
    }

    const doc = await Sync.findOneAndUpdate(
      { hash: oldCredHash },
      { hash: newCredHash },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'syncId não encontrado para o hash fornecido' });

    res.json({ syncId: doc.syncId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET /:id ─────────────────────────────────────────────────────── */

router.get('/:id', async (req, res) => {
  try {
    const doc = await findByAny(req.params.id);
    if (!doc) return res.status(404).json({ favorites: [], favorites_removed: [], progress: [], recent: [] });
    res.json({
      favorites:         doc.favorites         || [],
      favorites_removed: doc.favorites_removed || [],
      progress:          doc.progress          || [],
      recent:            doc.recent            || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ─── POST /:id ────────────────────────────────────────────────────── */

router.post('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { favorites, favorites_removed, progress, recent } = req.body || {};

    // Tenta actualizar por syncId; se não encontrar, tenta hash (clientes antigos)
    const update = {
      favorites:         favorites         ?? [],
      favorites_removed: favorites_removed ?? [],
      progress:          progress          ?? [],
      recent:            recent            ?? [],
      updatedAt:         new Date(),
    };

    const existing = await findByAny(id);
    if (existing) {
      Object.assign(existing, update);
      await existing.save();
    } else {
      // Novo documento (syncId não existe ainda): cria com syncId
      await Sync.create({ syncId: id, ...update });
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
