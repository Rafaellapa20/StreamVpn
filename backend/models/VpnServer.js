const mongoose = require('mongoose');

// Servidor VPN = grupo de WireGuards. Ao pedir config, o sistema roda
// automaticamente entre os WireGuards ativos do servidor.
const wireguardSchema = new mongoose.Schema({
  name: String,
  config: { type: String, required: true },   // texto completo do .conf
  endpoint: String,                            // host:porta lido do [Peer]
  active: { type: Boolean, default: true },
  assigned: { type: Number, default: 0 }       // quantas vezes foi entregue (para rotação)
});

const vpnServerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  wireguards: [wireguardSchema],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

vpnServerSchema.statics.parseEndpoint = (config) => {
  const m = /^\s*Endpoint\s*=\s*(\S+)/mi.exec(config || '');
  return m ? m[1] : undefined;
};

// Devolve o WireGuard ativo menos usado e incrementa o contador (rotação)
vpnServerSchema.methods.nextWireguard = async function () {
  const active = this.wireguards.filter(w => w.active);
  if (!active.length) return null;
  const wg = active.reduce((a, b) => (a.assigned <= b.assigned ? a : b));
  wg.assigned += 1;
  await this.save();
  return wg;
};

module.exports = mongoose.model('VpnServer', vpnServerSchema);
