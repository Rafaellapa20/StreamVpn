require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const { auth } = require('./middleware/auth');
const { generateTurnCredentials } = require('./utils/turn');
const { resolveCountry } = require('./utils/ipinfo');
const wsHub = require('./ws-hub');

const app = express();

// Está atrás do Nginx (proxy reverso) — sem isto, express-rate-limit e o
// req.ip veriam sempre o IP do Nginx (127.0.0.1) em vez do cliente real.
app.set('trust proxy', 1);

// CSP desativada: o painel admin (public/index.html) usa <script>/<style>
// inline sem nonce. As restantes proteções do helmet (HSTS, X-Frame-Options,
// X-Content-Type-Options, etc.) continuam ativas.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/streamvpn')
  .then(async () => {
    console.log('✅ MongoDB conectado');
    await require('./routes/auth').seedDefaults();

    // Resolve country for existing servers without it (one-time background migration)
    setTimeout(async () => {
      try {
        const VpnServer = require('./models/VpnServer');
        const servers = await VpnServer.find({ $or: [{ country: '' }, { country: null }] });
        for (const s of servers) {
          const ep = s.wireguards.find(w => w.endpoint)?.endpoint || '';
          if (!ep) continue;
          const { country, countryName } = await resolveCountry(ep);
          if (country) { s.country = country; s.countryName = countryName; await s.save(); }
        }
        console.log('✅ Países dos servidores VPN resolvidos');
      } catch (e) { console.warn('⚠️ Erro ao resolver países:', e.message); }
    }, 5000);
  })
  .catch(err => console.error('❌ MongoDB erro:', err));

// Painel admin (HTML estático, sem build)
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', (req, res) => res.json({ status: 'online', version: '1.1.0' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/devices', require('./routes/devices'));
app.use('/api/pairing', require('./routes/pairing'));
app.use('/api/sync', require('./routes/sync'));
app.use('/v1/meta', require('./routes/meta'));
app.use('/api', require('./routes/vpn-complete'));

// Credenciais TURN temporárias (usadas pela app e pelo painel para o WebRTC
// do controlo remoto). Qualquer conta autenticada pode pedir as suas.
app.get('/api/turn-credentials', auth, (req, res) => {
  try {
    res.json(generateTurnCredentials(req.user.username || String(req.user._id)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
wsHub.attach(server);
server.listen(PORT, () => console.log(`🚀 StreamVPN Backend rodando na porta ${PORT}`));
