const mongoose = require('mongoose');

// Utilizador = a mesma conta que o cliente usa na app IPTV (username + password).
// Email é opcional (só o admin costuma ter). assignedVpn é a VPN que o admin lhe atribuiu.
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ['user', 'admin', 'reseller'], default: 'user' },
  active: { type: Boolean, default: true },
  assignedVpn: { type: mongoose.Schema.Types.ObjectId, ref: 'VpnServer' },
  quota: {
    monthlyBandwidth: { type: Number, default: 1000 },
    usedBandwidth: { type: Number, default: 0 },
    resetDate: Date,
    status: { type: String, default: 'good' }
  },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', userSchema);
