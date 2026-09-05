const mongoose = require('mongoose');
const vpnServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: String,
  country: String,
  endpoint: String,
  protocol: { type: String, default: 'WireGuard' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('VpnServer', vpnServerSchema);
