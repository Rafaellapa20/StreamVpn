const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const { auth, sign } = require('../middleware/auth');

// Cria os utilizadores default se a BD estiver vazia
async function seedDefaults() {
  if (await User.countDocuments() > 0) return;
  await User.create([
    { email: 'admin@example.com', password: await bcrypt.hash('admin123', 10), name: 'Admin', role: 'admin' },
    { email: 'user@example.com',  password: await bcrypt.hash('user123', 10),  name: 'User',  role: 'user' }
  ]);
  console.log('👤 Utilizadores default criados (admin@example.com / user@example.com)');
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
