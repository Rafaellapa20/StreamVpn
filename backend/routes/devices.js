const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const DeviceEvent = require('../models/DeviceEvent');
const { adminAuth } = require('../middleware/auth');

router.use(adminAuth);

// Lista de dispositivos (com estado online) — o painel também recebe isto pelo WebSocket
router.get('/', async (req, res) => {
  const filter = req.query.userId ? { userId: req.query.userId } : {};
  const list = await Device.find(filter).select('-lastScreenshot').sort({ online: -1, lastSeen: -1 }).lean();
  res.json(list);
});

router.get('/:deviceId', async (req, res) => {
  const d = await Device.findOne({ deviceId: req.params.deviceId }).lean();
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  res.json(d);
});

// Histórico de comandos/eventos de um dispositivo
router.get('/:deviceId/events', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  res.json(await DeviceEvent.find({ deviceId: req.params.deviceId }).sort({ createdAt: -1 }).limit(limit).lean());
});

router.delete('/:deviceId', async (req, res) => {
  const d = await Device.findOneAndDelete({ deviceId: req.params.deviceId });
  if (!d) return res.status(404).json({ error: 'Dispositivo não encontrado' });
  await DeviceEvent.deleteMany({ deviceId: req.params.deviceId });
  res.json({ success: true });
});

module.exports = router;
