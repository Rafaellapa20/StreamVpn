const mongoose = require('mongoose');

// Documento de sync por utilizador.
// Identificado por syncId (UUID atribuído pelo servidor).
// O campo hash mantém o credHash (SHA-256(user:pass)) para a rota POST /id
// e para ler dados de clientes antigos que usavam o hash diretamente.
const SyncSchema = new mongoose.Schema({
  syncId:            { type: String, unique: true, sparse: true, index: true },
  hash:              { type: String, unique: true, sparse: true, index: true }, // credHash OU hash legado
  favorites:         { type: mongoose.Schema.Types.Mixed, default: [] },
  favorites_removed: { type: mongoose.Schema.Types.Mixed, default: [] },
  progress:          { type: mongoose.Schema.Types.Mixed, default: [] },
  recent:            { type: mongoose.Schema.Types.Mixed, default: [] },
  updatedAt:         { type: Date, default: Date.now }
});

module.exports = mongoose.model('Sync', SyncSchema);
