const mongoose = require('mongoose');
// Domínio IPTV disponível para associar a utilizadores (ex.: globalstreams.top)
const dnsSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
  label: String,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Dns', dnsSchema);
