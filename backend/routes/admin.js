const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const Dns = require('../models/Dns');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Packs disponíveis: meses → créditos
const PACKS = { 1: 1, 3: 3, 6: 6, 12: 12 };
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };
const isAdmin = (u) => u.role === 'admin';

// ---- Visão geral ----
router.get('/stats', async (req, res) => {
  const now = new Date();
  const [users, activeUsers, expired, servers, wgs, active, me] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', active: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }),
    User.countDocuments({ role: 'user', expiresAt: { $lte: now } }),
    VpnServer.countDocuments({ status: 'active' }),
    VpnServer.aggregate([{ $unwind: '$wireguards' }, { $match: { 'wireguards.active': true } }, { $count: 'n' }]),
    VpnLog.countDocuments({ status: 'active' }),
    User.findById(req.user._id).select('credits role')
  ]);
  res.json({ users, activeUsers, expired, servers, wireguards: wgs[0]?.n || 0, activeConnections: active,
    credits: isAdmin(me) ? null : me.credits, packs: PACKS });
});

// ---- DNS ----
router.get('/dns', async (req, res) => res.json(await Dns.find().sort({ domain: 1 })));
router.post('/dns', async (req, res) => {
  try {
    const domain = (req.body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return res.status(400).json({ error: 'Domínio obrigatório' });
    res.status(201).json(await Dns.create({ domain, label: req.body.label }));
  } catch (err) { res.status(400).json({ error: err.code === 11000 ? 'Esse DNS já existe' : err.message }); }
});
router.put('/dns/:id', async (req, res) => {
  const d = await Dns.findByIdAndUpdate(req.params.id, { active: req.body.active, label: req.body.label }, { new: true });
  if (!d) return res.status(404).json({ error: 'DNS não encontrado' });
  res.json(d);
});
router.delete('/dns/:id', async (req, res) => {
  const d = await Dns.findByIdAndDelete(req.params.id);
  if (!d) return res.status(404).json({ error: 'DNS não encontrado' });
  await User.updateMany({ dns: d.domain }, { $pull: { dns: d.domain } });
  res.json({ success: true });
});

// ---- Servidores VPN (grupos de WireGuards) ----
const serverView = (s, usersById = {}) => ({
  _id: s._id, name: s.name, status: s.status, createdAt: s.createdAt,
  users: usersById[String(s._id)] || 0,
  wireguards: s.wireguards.map(w => ({ _id: w._id, name: w.name, endpoint: w.endpoint, active: w.active, assigned: w.assigned }))
});

router.get('/servers', async (req, res) => {
  const [servers, counts] = await Promise.all([
    VpnServer.find().sort({ createdAt: -1 }),
    User.aggregate([{ $unwind: '$vpnServers' }, { $group: { _id: '$vpnServers', n: { $sum: 1 } } }])
  ]);
  const byId = Object.fromEntries(counts.map(c => [String(c._id), c.n]));
  res.json(servers.map(s => serverView(s, byId)));
});

router.post('/servers', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome do servidor obrigatório' });
    const s = await VpnServer.create({ name });
    res.status(201).json(serverView(s));
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/servers/:id', async (req, res) => {
  const upd = {};
  if (req.body.name) upd.name = req.body.name.trim();
  if (req.body.status) upd.status = req.body.status;
  const s = await VpnServer.findByIdAndUpdate(req.params.id, upd, { new: true });
  if (!s) return res.status(404).json({ error: 'Servidor não encontrado' });
  res.json(serverView(s));
});

router.delete('/servers/:id', async (req, res) => {
  const s = await VpnServer.findByIdAndDelete(req.params.id);
  if (!s) return res.status(404).json({ error: 'Servidor não encontrado' });
  await User.updateMany({ vpnServers: s._id }, { $pull: { vpnServers: s._id } });
  res.json({ success: true });
});

// WireGuards dentro de um servidor
router.post('/servers/:id/wireguards', async (req, res) => {
  const s = await VpnServer.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Servidor não encontrado' });
  const config = (req.body.config || '').trim();
  if (!config.includes('[Interface]') || !config.includes('[Peer]')) {
    return res.status(400).json({ error: 'Cola a configuração WireGuard completa ([Interface] e [Peer])' });
  }
  const endpoint = VpnServer.parseEndpoint(config);
  s.wireguards.push({ config, endpoint, name: (req.body.name || '').trim() || `WG ${s.wireguards.length + 1}` });
  await s.save();
  res.status(201).json(serverView(s));
});

router.get('/servers/:id/wireguards/:wgId/config', async (req, res) => {
  const s = await VpnServer.findById(req.params.id);
  const wg = s?.wireguards.id(req.params.wgId);
  if (!wg) return res.status(404).json({ error: 'WireGuard não encontrado' });
  res.json({ name: wg.name, endpoint: wg.endpoint, config: wg.config });
});

router.put('/servers/:id/wireguards/:wgId', async (req, res) => {
  const s = await VpnServer.findById(req.params.id);
  const wg = s?.wireguards.id(req.params.wgId);
  if (!wg) return res.status(404).json({ error: 'WireGuard não encontrado' });
  if (typeof req.body.active === 'boolean') wg.active = req.body.active;
  if (req.body.name) wg.name = req.body.name.trim();
  if (req.body.config) { wg.config = req.body.config.trim(); wg.endpoint = VpnServer.parseEndpoint(wg.config); }
  await s.save();
  res.json(serverView(s));
});

router.delete('/servers/:id/wireguards/:wgId', async (req, res) => {
  const s = await VpnServer.findById(req.params.id);
  const wg = s?.wireguards.id(req.params.wgId);
  if (!wg) return res.status(404).json({ error: 'WireGuard não encontrado' });
  wg.deleteOne();
  await s.save();
  res.json(serverView(s));
});

// ---- Utilizadores ----
const userSelect = '-password';
router.get('/users', async (req, res) =>
  res.json(await User.find({ role: 'user' }).select(userSelect).populate('vpnServers', 'name status').populate('createdBy', 'username').sort({ createdAt: -1 })));

router.get('/admins', async (req, res) =>
  res.json(await User.find({ role: { $in: ['admin', 'reseller'] } }).select(userSelect).sort({ createdAt: -1 })));

// Criar utilizador = gastar um pack (créditos) e definir validade
router.post('/users', async (req, res) => {
  try {
    const { username, password, mac, notes, requireClientApp, dns, packMonths } = req.body;
    const vpnServers = Array.isArray(req.body.vpnServers) ? req.body.vpnServers.filter(Boolean) : [];
    if (!username || !password) return res.status(400).json({ error: 'Utilizador e password obrigatórios' });
    if (!vpnServers.length) return res.status(400).json({ error: 'Seleciona pelo menos um servidor VPN' });
    const months = Number(packMonths);
    if (!PACKS[months]) return res.status(400).json({ error: 'Pack VPN inválido' });

    const servers = await VpnServer.find({ _id: { $in: vpnServers } });
    if (servers.length !== vpnServers.length) return res.status(400).json({ error: 'Servidor VPN inválido' });
    if (!servers.some(s => s.status === 'active' && s.wireguards.some(w => w.active))) return res.status(400).json({ error: 'Nenhum dos servidores tem WireGuards ativos' });

    const creator = await User.findById(req.user._id);
    const cost = PACKS[months];
    if (!isAdmin(creator) && creator.credits < cost) {
      return res.status(402).json({ error: `Créditos insuficientes: precisas de ${cost}, tens ${creator.credits}` });
    }

    const u = await User.create({
      username, password: await bcrypt.hash(password, 10), role: 'user',
      mac: mac || undefined, notes, requireClientApp: !!requireClientApp,
      dns: Array.isArray(dns) ? dns : [], vpnServers,
      packMonths: months, expiresAt: addMonths(new Date(), months), createdBy: creator._id
    });
    if (!isAdmin(creator)) await User.updateOne({ _id: creator._id }, { $inc: { credits: -cost } });

    res.status(201).json({ ...u.toObject(), password: undefined });
  } catch (err) {
    res.status(400).json({ error: err.code === 11000 ? 'Esse utilizador já existe' : err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const upd = {};
  const b = req.body;
  if (b.password) upd.password = await bcrypt.hash(b.password, 10);
  if (typeof b.active === 'boolean') upd.active = b.active;
  if (typeof b.requireClientApp === 'boolean') upd.requireClientApp = b.requireClientApp;
  if ('mac' in b) upd.mac = b.mac || null;
  if ('notes' in b) upd.notes = b.notes;
  if (Array.isArray(b.dns)) upd.dns = b.dns;
  if (Array.isArray(b.vpnServers)) upd.vpnServers = b.vpnServers.filter(Boolean);
  if (b.monthlyBandwidth) upd['quota.monthlyBandwidth'] = Number(b.monthlyBandwidth);
  if (b.credits !== undefined && isAdmin(req.user)) upd.credits = Number(b.credits);
  const u = await User.findByIdAndUpdate(req.params.id, upd, { new: true }).select(userSelect).populate('vpnServers', 'name');
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json(u);
});

// Renovar = gastar outro pack; soma à validade atual (ou a hoje, se já expirou)
router.post('/users/:id/renew', async (req, res) => {
  const months = Number(req.body.packMonths);
  if (!PACKS[months]) return res.status(400).json({ error: 'Pack VPN inválido' });
  const [u, creator] = await Promise.all([User.findById(req.params.id), User.findById(req.user._id)]);
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  const cost = PACKS[months];
  if (!isAdmin(creator) && creator.credits < cost) return res.status(402).json({ error: `Créditos insuficientes: precisas de ${cost}, tens ${creator.credits}` });
  const base = u.expiresAt && u.expiresAt > new Date() ? u.expiresAt : new Date();
  u.expiresAt = addMonths(base, months); u.packMonths = months; u.active = true;
  await u.save();
  if (!isAdmin(creator)) await User.updateOne({ _id: creator._id }, { $inc: { credits: -cost } });
  res.json({ ...u.toObject(), password: undefined });
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user._id) return res.status(400).json({ error: 'Não podes apagar a tua própria conta' });
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilizador não encontrado' });
  res.json({ success: true });
});

router.post('/users/:id/reset-quota', async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id,
    { 'quota.usedBandwidth': 0, 'quota.status': 'good', 'quota.resetDate': new Date() }, { new: true }).select(userSelect);
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
