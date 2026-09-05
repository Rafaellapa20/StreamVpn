const mongoose = require('mongoose');

// Uma VPN = uma configuração WireGuard colada pelo admin. O nome e o endpoint
// são extraídos automaticamente da configuração; nada mais é obrigatório.
const vpnServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  config: { type: String, required: true },   // texto completo do .conf WireGuard
  endpoint: String,                            // host:porta lido do [Peer] Endpoint
  protocol: { type: String, default: 'WireGuard' },
  location: String,
  country: String,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

// Lê "Endpoint = host:porta" do texto WireGuard
vpnServerSchema.statics.parseEndpoint = (config) => {
  const m = /^\s*Endpoint\s*=\s*(\S+)/mi.exec(config || '');
  return m ? m[1] : undefined;
};

module.exports = mongoose.model('VpnServer', vpnServerSchema);
