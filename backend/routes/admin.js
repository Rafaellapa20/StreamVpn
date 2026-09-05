const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// ---- Dashboard ----
router.get('/stats', async (req, res) => {
  const [users, servers, activeServers, logs, active] = await Promise.all([
    User.countDocuments(), VpnServer.countDocuments(), VpnServer.countDocuments({ status: 'active' }),
    VpnLog.countDocuments(), VpnLog.countDocuments({ status: 'active' })
  ]);
  res.json({ users, servers, activeServers, logs, activeConnections: active });
});

// ---- Servidores VPN ----
router.get('/servers', async (req, res) => res.json(await VpnServer.find().sort({ createdAt: -1 })));

router.post('/servers', async (req, res) => {
  try {
    const { name, location, country, endpoint, protocol, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    res.status(201).json(await VpnServer.create({ name, location, country, endpoint, protocol, status }));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/servers/:id', async (req, res) => {
  const s = await VpnServer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!s) return res.status(404).json({ error: 'Servidor não encontrado' });
  res.json(s);
});

router.delete('/servers/:id', async (req, res) => {
  const s = await VpnServer.findByIdAndDelete(req.params.id);
  if (!s) return res.status(404).json({ error: 'Servidor não encontrado' });
  res.json({ success: true });
});

// ---- Utilizadores ----
router.get('/users', async (req, res) =>
  res.json(await User.find().select('-password').populate('assignedVpn', 'name').sort({ createdAt: -1 })));

router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role, assignedVpn } = req.body;
    const monthly = Number(req.body['quota.monthlyBandwidth'] ?? req.body.quota?.monthlyBandwidth);
    if (!email || !password) return res.status(400).json({ error: 'Email e password obrigatórios' });
    const u = await User.create({
      email: email.toLowerCase().trim(), password: await bcrypt.hash(password, 10),
      name, role: role || 'user', assignedVpn: assignedVpn || undefined,
      ...(Number.isFinite(monthly) ? { quota: { monthlyBandwidth: monthly } } : {})
    });
    res.status(201).json({ ...u.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Email já existe' : err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const upd = { ...req.body };
  if (upd.password) upd.password = await bcrypt.hash(upd.password, 10); else delete upd.password;
  if (upd.assignedVpn === '') upd.assignedVpn = null;
  const u = await User.findByIdAndUpdate(req.params.id, upd, { new: true }).select('-password');
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(u);
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user._id) return res.status(400).json({ error: 'Não podes apagar a tua própria conta' });
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json({ success: true });
});

router.post('/users/:id/reset-quota', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id,
    { 'quota.usedBandwidth': 0, 'quota.status': 'good', 'quota.resetDate': new Date() }, { new: true }).select('-password');
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(u);
});

// ---- Logs ----
router.get('/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await VpnLog.find().sort({ createdAt: -1 }).limit(limit)
    .populate('userId', 'email').populate('serverId', 'name'));
});

module.exports = router;
