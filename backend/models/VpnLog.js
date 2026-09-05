const mongoose = require('mongoose');
const vpnLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'VpnServer' },
  ipAddress: String,
  localIp: String,
  publicIp: String,
  protocol: { type: String, default: 'WireGuard' },
  bytesDownloaded: { type: Number, default: 0 },
  bytesUploaded: { type: Number, default: 0 },
  latency: Number,
  packetLoss: Number,
  downloadSpeed: Number,
  uploadSpeed: Number,
  status: { type: String, enum: ['active', 'disconnected', 'error'], default: 'active' },
  resellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reseller' },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('VpnLog', vpnLogSchema);
