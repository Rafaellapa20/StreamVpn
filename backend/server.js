require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/streamvpn')
  .then(async () => {
    console.log('✅ MongoDB conectado');
    await require('./routes/auth').seedDefaults();
  })
  .catch(err => console.error('❌ MongoDB erro:', err));

// Painel admin (HTML estático, sem build)
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', (req, res) => res.json({ status: 'online', version: '1.1.0' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/vpn-complete'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 StreamVPN Backend rodando na porta ${PORT}`));
