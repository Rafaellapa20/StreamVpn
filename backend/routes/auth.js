const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const { auth, sign } = require('../middleware/auth');

// Máx. 10 tentativas de login por IP a cada 15 min — mitiga força-bruta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de login. Tenta novamente mais tarde.' }
});

// Cria só a conta de admin se a BD estiver vazia. A password vem de
// ADMIN_PASSWORD ou é gerada e impressa UMA VEZ no log. Também migra contas
// antigas que só tinham email (passa o email para username).
async function seedDefaults() {
  await User.updateMany({ username: { $exists: false }, email: { $exists: true } },
    [{ $set: { username: '$email' } }]).catch(() => {});

  if (await User.countDocuments() > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  await User.create({ username: 'admin', email, password: await bcrypt.hash(password, 10), name: 'Admin', role: 'admin' });
  console.log('👤 Conta de admin criada: admin (' + email + ')');
  if (!process.env.ADMIN_PASSWORD) {
    console.log('🔑 Password inicial (só aparece agora, muda-a já no painel):', password);
  }
}

// Login com username (o mesmo da app IPTV) — aceita também email por compatibilidade.
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const id = (username || email || '').toLowerCase().trim();
    const user = await User.findOne({ $or: [{ username: id }, { email: id }] });
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (user.active === false) return res.status(403).json({ error: 'Conta desativada' });
    res.json({
      success: true, token: sign(user),
      user: { username: user.username, email: user.email, name: user.name, role: user.role, expiresAt: user.expiresAt, credits: user.role === 'admin' ? null : user.credits }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.user._id).select('-password').populate('vpnServers', 'name');
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(u);
});

module.exports = router;
module.exports.seedDefaults = seedDefaults;
