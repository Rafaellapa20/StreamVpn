const mongoose = require('mongoose');

// Documento de sync por utilizador (hash SHA-256 de username:password).
// Guarda favoritos, progresso de reprodução e recentes.
const SyncSchema = new mongoose.Schema({
  hash:      { type: String, required: true, unique: true, index: true },
  favorites: { type: mongoose.Schema.Types.Mixed, default: [] },
  progress:  { type: mongoose.Schema.Types.Mixed, default: [] },
  recent:    { type: mongoose.Schema.Types.Mixed, default: [] },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sync', SyncSchema);
