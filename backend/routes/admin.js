const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// ---- Visão geral ----
router.get('/stats', async (req, res) => {
  const [users, activeUsers, servers, activeServers, logs, active] = await Promise.all([
    User.countDocuments({ role: 'user' }), User.countDocuments({ role: 'user', active: true }),
    VpnServer.countDocuments(), VpnServer.countDocuments({ status: 'active' }),
    VpnLog.countDocuments(), VpnLog.countDocuments({ status: 'active' })
  ]);
  res.json({ users, activeUsers, servers, activeServers, logs, activeConnections: active });
});

// ---- VPNs ----
router.get('/servers', async (req, res) => {
  const servers = await VpnServer.find().select('-config').sort({ createdAt: -1 }).lean();
  const counts = await User.aggregate([{ $match: { assignedVpn: { $ne: null } } }, { $group: { _id: '$assignedVpn', n: { $sum: 1 } } }]);
  const byId = Object.fromEntries(counts.map(c => [String(c._id), c.n]));
  res.json(servers.map(s => ({ ...s, users: byId[String(s._id)] || 0 })));
});

router.get('/servers/:id/config', async (req, res) => {
  const s = await VpnServer.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'VPN não encontrada' });
  res.json({ name: s.name, config: s.config });
});

// Só é preciso colar a configuração; nome e endpoint saem de lá.
router.post('/servers', async (req, res) => {
  try {
    const config = (req.body.config || '').trim();
    if (!config.includes('[Interface]') || !config.includes('[Peer]')) {
      return res.status(400).json({ error: 'Cola a configuração WireGuard completa ([Interface] e [Peer])' });
    }
    const endpoint = VpnServer.parseEndpoint(config);
    const name = (req.body.name || '').trim() || (endpoint ? endpoint.split(':')[0] : `VPN ${await VpnServer.countDocuments() + 1}`);
    const s = await VpnServer.create({ name, config, endpoint });
    res.status(201).json({ ...s.toObject(), config: undefined });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/servers/:id', async (req, res) => {
  const upd = {};
  if (req.body.name) upd.name = req.body.name.trim();
  if (req.body.status) upd.status = req.body.status;
  if (req.body.config) { upd.config = req.body.config.trim(); upd.endpoint = VpnServer.parseEndpoint(upd.config); }
  const s = await VpnServer.findByIdAndUpdate(req.params.id, upd, { new: true, runValidators: true }).select('-config');
  if (!s) return res.status(404).json({ error: 'VPN não encontrada' });
  res.json(s);
});

router.delete('/servers/:id', async (req, res) => {
  const s = await VpnServer.findByIdAndDelete(req.params.id);
  if (!s) return res.status(404).json({ error: 'VPN não encontrada' });
  await User.updateMany({ assignedVpn: s._id }, { $unset: { assignedVpn: 1 } });
  res.json({ success: true });
});

// ---- Utilizadores ----
router.get('/users', async (req, res) =>
  res.json(await User.find().select('-password').populate('assignedVpn', 'name endpoint status').sort({ createdAt: -1 })));

router.post('/users', async (req, res) => {
  try {
    const { username, password, assignedVpn, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Utilizador e password obrigatórios' });
    const monthly = Number(req.body.monthlyBandwidth);
    const u = await User.create({
      username, password: await bcrypt.hash(password, 10),
      role: role === 'admin' ? 'admin' : 'user',
      assignedVpn: assignedVpn || undefined,
      ...(Number.isFinite(monthly) && monthly > 0 ? { quota: { monthlyBandwidth: monthly } } : {})
    });
    res.status(201).json({ ...u.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Esse utilizador já existe' : err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const upd = {};
  if (req.body.password) upd.password = await bcrypt.hash(req.body.password, 10);
  if (typeof req.body.active === 'boolean') upd.active = req.body.active;
  if ('assignedVpn' in req.body) upd.assignedVpn = req.body.assignedVpn || null;
  if (req.body.monthlyBandwidth) upd['quota.monthlyBandwidth'] = Number(req.body.monthlyBandwidth);
  if (req.body.role && req.user._id !== req.params.id) upd.role = req.body.role === 'admin' ? 'admin' : 'user';
  const u = await User.findByIdAndUpdate(req.params.id, upd, { new: true }).select('-password').populate('assignedVpn', 'name');
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

// ---- Ligações ----
router.get('/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await VpnLog.find().sort({ createdAt: -1 }).limit(limit)
    .populate('userId', 'username').populate('serverId', 'name'));
});

module.exports = router;
