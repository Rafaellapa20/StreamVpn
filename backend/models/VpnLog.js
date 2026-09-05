const mongoose = require('mongoose');

const vpnLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  serverId: mongoose.Schema.Types.ObjectId,
  serverName: String,
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  ipAddress: String,
  protocol: { type: String, default: 'WireGuard' },
  bytesDownloaded: { type: Number, default: 0 },
  bytesUploaded: { type: Number, default: 0 },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now, index: true }
});

vpnLogSchema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model('VpnLog', vpnLogSchema);
