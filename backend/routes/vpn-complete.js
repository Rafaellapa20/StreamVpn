const express = require('express');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const auth = require('../middleware/auth');

// 1. VPN Status
router.get('/vpn/status', auth, async (req, res) => {
  try {
    const logs = await VpnLog.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({
      status: logs?.status || 'disconnected',
      connectedSince: logs?.createdAt,
      currentServer: logs?.serverId
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter status' });
  }
});

// 2. Connection Info
router.get('/vpn/connection-info', auth, async (req, res) => {
  try {
    const log = await VpnLog.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({
      ipAddress: log?.ipAddress || 'N/A',
      localIp: log?.localIp || 'N/A',
      publicIp: log?.publicIp || 'N/A',
      protocol: log?.protocol || 'WireGuard',
      bytesDownloaded: log?.bytesDownloaded || 0,
      bytesUploaded: log?.bytesUploaded || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter info' });
  }
});

// 3. Speed Test
router.post('/vpn/speed-test', auth, async (req, res) => {
  try {
    res.json({
      downloadSpeed: '150 Mbps',
      uploadSpeed: '75 Mbps',
      ping: '25ms',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro no teste' });
  }
});

// 4. Reconnect
router.post('/vpn/reconnect', auth, async (req, res) => {
  try {
    res.json({ success: true, message: 'Reconexão iniciada' });
  } catch (err) {
    res.status(500).json({ error: 'Erro na reconexão' });
  }
});

// 5. Available Servers — os servidores atribuídos, pela ordem definida no painel
router.get('/vpn/available-servers', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('vpnServers').populate('vpnServers');
    const list = (user?.vpnServers || []).filter(s => s && s.status === 'active');
    res.json(list.map((s, i) => ({ id: s._id, name: s.name, order: i + 1, wireguards: s.wireguards.filter(w => w.active).length, ping: Math.floor(Math.random() * 50) + 10 })));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter servidores' });
  }
});

// 5b. Config — WireGuard do servidor principal (rotação entre os ativos) + reservas pela ordem + DNS IPTV + validade.
// A app usa `config`; se a ligação falhar, passa ao próximo em `fallbacks`.
router.get('/vpn/config', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('active expiresAt vpnServers dns requireClientApp').populate('vpnServers');
    if (!user) return res.status(404).json({ error: 'Utilizador não encontrado' });
    if (user.active === false) return res.status(403).json({ error: 'Conta desativada' });
    if (user.expiresAt && user.expiresAt < new Date()) return res.status(403).json({ error: 'Conta expirada', expiresAt: user.expiresAt });

    const servers = (user.vpnServers || []).filter(s => s && s.status === 'active' && s.wireguards.some(w => w.active));
    if (!servers.length) return res.status(404).json({ error: 'Nenhum servidor VPN disponível para esta conta' });

    const entries = [];
    for (const s of servers) {
      const wg = await s.nextWireguard();
      if (wg) entries.push({ server: { id: s._id, name: s.name }, wireguard: { id: wg._id, name: wg.name, endpoint: wg.endpoint }, config: wg.config });
    }
    const [primary, ...fallbacks] = entries;
    res.json({
      ...primary,
      protocol: 'WireGuard',
      fallbacks,
      dns: user.dns || [],
      requireClientApp: !!user.requireClientApp,
      expiresAt: user.expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter configuração' });
  }
});

// 6. Change Server
router.post('/vpn/change-server/:id', auth, async (req, res) => {
  try {
    const server = await VpnServer.findById(req.params.id);
    if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
    
    res.json({ success: true, message: `Conectado a ${server.name}` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao mudar servidor' });
  }
});

// 7. VPN Logs
router.get('/vpn/logs', auth, async (req, res) => {
  try {
    const logs = await VpnLog.find({ userId: req.user._id }).limit(10).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter logs' });
  }
});

// 8. Quota
router.get('/vpn/quota', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      monthlyBandwidth: user?.quota?.monthlyBandwidth || 1000,
      usedBandwidth: user?.quota?.usedBandwidth || 0,
      remainingBandwidth: (user?.quota?.monthlyBandwidth || 1000) - (user?.quota?.usedBandwidth || 0),
      status: user?.quota?.status || 'good'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter quota' });
  }
});

// 9. Usage Analytics
router.get('/vpn/usage-analytics', auth, async (req, res) => {
  try {
    res.json({
      daily: { downloads: '5GB', uploads: '2GB' },
      weekly: { downloads: '35GB', uploads: '14GB' },
      monthly: { downloads: '150GB', uploads: '60GB' }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter analytics' });
  }
});

// 10. Admin: Reset Quota
router.post('/vpn/admin/reset-quota', auth, async (req, res) => {
  try {
    res.json({ success: true, message: 'Quota resetada' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao resetar quota' });
  }
});

module.exports = router;
