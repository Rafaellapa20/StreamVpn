const mongoose = require('mongoose');

// Um dispositivo = uma instalação da app (TV box, telemóvel) ligada a um utilizador.
// Identificado pelo deviceId gerado pela app na primeira execução.
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  username: String,
  mac: String,
  model: String,
  brand: String,
  androidVersion: String,
  appVersion: String,
  ip: String,
  online: { type: Boolean, default: false },
  lastSeen: Date,
  // estado reportado pela app no heartbeat
  screen: String,          // ex.: "LiveTvActivity", "PlayerActivity"
  playing: String,         // canal/filme atual
  vpnOn: { type: Boolean, default: false },
  lastScreenshot: String,  // JPEG base64 (data URL) da última captura
  lastScreenshotAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Device', deviceSchema);
