const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const User = require('../models/User');
const { auth, sign } = require('../middleware/auth');

// Cria só a conta de admin se a BD estiver vazia, com password aleatória
// forte (nunca 'admin123' — isso ficaria público no código-fonte no GitHub).
// A password é impressa UMA VEZ no log do arranque; muda-a no painel depois
// do primeiro login. Não é criada nenhuma conta "user" de exemplo — os
// utilizadores reais são geridos a partir do painel de admin.
async function seedDefaults() {
  if (await User.countDocuments() > 0) return;
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  await User.create({ email, password: await bcrypt.hash(password, 10), name: 'Admin', role: 'admin' });
  console.log('👤 Conta de admin criada:', email);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('🔑 Password inicial (só aparece agora, muda-a já no painel):', password);
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    res.json({ success: true, token: sign(user), user: { email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/me', auth, async (req, res) => {
  const u = await User.findById(req.user._id).select('-password');
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(u);
});

module.exports = router;
module.exports.seedDefaults = seedDefaults;
