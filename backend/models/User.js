const mongoose = require('mongoose');

// Utilizador = a conta que o cliente usa na app IPTV.
// Criado por um admin/revendedor gastando créditos de um pack VPN (validade em meses).
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true, lowercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, enum: ['user', 'admin', 'reseller'], default: 'user' },
  active: { type: Boolean, default: true },

  // Código de ativação: o cliente mete-o uma vez na app e fica ligado a esta conta
  activationCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },

  // --- Dados do cliente ---
  mac: { type: String, trim: true, uppercase: true },
  notes: String,
  requireClientApp: { type: Boolean, default: false },
  dns: [String],                                    // domínios IPTV, por ordem de tentativa
  vpnServers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'VpnServer' }], // por ordem: 1.º principal, seguintes de reserva
  packMonths: Number,
  expiresAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- Só para admin/reseller ---
  credits: { type: Number, default: 0 },

  quota: {
    monthlyBandwidth: { type: Number, default: 1000 },
    usedBandwidth: { type: Number, default: 0 },
    resetDate: Date,
    status: { type: String, default: 'good' }
  },
  createdAt: { type: Date, default: Date.now }
});

userSchema.virtual('expired').get(function () { return !!this.expiresAt && this.expiresAt < new Date(); });
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);
