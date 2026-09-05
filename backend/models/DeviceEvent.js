const mongoose = require('mongoose');

// Histórico: comandos enviados pelo painel e eventos do dispositivo (online/offline, erros).
const deviceEventSchema = new mongoose.Schema({
  deviceId: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['command', 'result', 'online', 'offline', 'message', 'error'], required: true },
  command: String,           // KEY, RESTART, MESSAGE, SCREENSHOT, LIVE_ON, LIVE_OFF, RELOAD
  payload: mongoose.Schema.Types.Mixed,
  by: String,                // username do admin que enviou
  ok: Boolean,
  detail: String,
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('DeviceEvent', deviceEventSchema);
