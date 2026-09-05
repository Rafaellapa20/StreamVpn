const express = require('express');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const auth = require('../middleware/auth');

router.get('/vpn/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('assignedVpn');
    if (!user.assignedVpn) return res.json({ success: true, connected: false });
    const activeLog = await VpnLog.findOne({ userId: req.user._id, endTime: null });
    res.json({ success: true, connected: !!activeLog, server: user.assignedVpn.name });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/vpn/quota', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const quota = user.quota || { monthlyBandwidth: 1000, usedBandwidth: 0 };
    res.json({
      success: true,
      quota: {
        limitGb: quota.monthlyBandwidth,
        usedGb: quota.usedBandwidth,
        percentage: Math.round((quota.usedBandwidth / quota.monthlyBandwidth) * 100)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/vpn/available-servers', auth, async (req, res) => {
  try {
    const servers = await VpnServer.find({ status: 'active' });
    res.json({ success: true, total: servers.length, servers });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const VpnServer = require('../models/VpnServer');
const VpnLog = require('../models/VpnLog');
const auth = require('../middleware/auth');

router.get('/vpn/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('assignedVpn');
    if (!user.assignedVpn) return res.json({ success: true, connected: false });
    const activeLog = await VpnLog.findOne({ userId: req.user._id, endTime: null });
    res.json({ success: true, connected: !!activeLog, server: user.assignedVpn.name });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/vpn/quota', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const quota = user.quota || { monthlyBandwidth: 1000, usedBandwidth: 0 };
    res.json({
      success: true,
      quota: {
        limitGb: quota.monthlyBandwidth,
        usedGb: quota.usedBandwidth,
        percentage: Math.round((quota.usedBandwidth / quota.monthlyBandwidth) * 100)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

router.get('/vpn/available-servers', auth, async (req, res) => {
  try {
    const servers = await VpnServer.find({ status: 'active' });
    res.json({ success: true, total: servers.length, servers });
  } catch (err) {
    res.status(500).json({ error: 'Erro' });
  }
});

module.exports = router;

