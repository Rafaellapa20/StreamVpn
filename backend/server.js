require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Conexão MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/streamvpn', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ MongoDB erro:', err));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', version: '1.0.0' });
});

// Login (mock)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'user@example.com' && password === 'user123') {
    return res.json({ 
      success: true, 
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      user: { email, name: 'User' } 
    });
  }
  res.status(401).json({ error: 'Credenciais inválidas' });
});

// VPN Routes
const vpnCompleteRoutes = require('./routes/vpn-complete');
app.use('/api', vpnCompleteRoutes);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 StreamVPN Backend rodando na porta ${PORT}`);
});
