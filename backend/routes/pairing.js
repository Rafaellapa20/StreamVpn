/**
 * Emparelhamento TV <-> telemóvel sem Firestore.
 * A TV faz POST /api/pairing com as credenciais → recebe um código de 6 dígitos.
 * O telemóvel faz GET /api/pairing/:code → recebe as credenciais e o código é apagado.
 * TTL: 10 minutos; limpeza automática a cada minuto.
 */
const express = require('express');
const router = express.Router();

// Mapa em memória: '123456' → { username, password, expiresAt }
const store = new Map();
const TTL_MS = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (v.expiresAt < now) store.delete(k);
}, 60_000);

function newCode() {
  for (let i = 0; i < 20; i++) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!store.has(c)) return c;
  }
  return null;
}

// POST /api/pairing  { username, password }  → { code }
router.post('/', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'username e password obrigatórios' });

  const code = newCode();
  if (!code) return res.status(503).json({ error: 'Tente novamente' });

  store.set(code, { username, password, expiresAt: Date.now() + TTL_MS });
  res.json({ code });
});

// GET /api/pairing/:code  → { username, password }  (uso único)
router.get('/:code', (req, res) => {
  const entry = store.get(req.params.code);
  if (!entry || entry.expiresAt < Date.now()) {
    store.delete(req.params.code);
    return res.status(404).json({ error: 'Código inválido ou expirado' });
  }
  store.delete(req.params.code);
  res.json({ username: entry.username, password: entry.password });
});

module.exports = router;
