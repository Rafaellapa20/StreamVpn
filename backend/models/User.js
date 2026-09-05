const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ['user', 'admin', 'reseller'], default: 'user' },
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
