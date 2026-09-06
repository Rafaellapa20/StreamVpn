const https = require('https');

const COUNTRY_NAMES = {
  PT:'Portugal', ES:'Espanha', FR:'França', DE:'Alemanha', GB:'Reino Unido',
  NL:'Holanda', US:'EUA', BR:'Brasil', IT:'Itália', PL:'Polónia',
  SE:'Suécia', NO:'Noruega', FI:'Finlândia', DK:'Dinamarca', CH:'Suíça',
  AT:'Áustria', BE:'Bélgica', CZ:'República Checa', RO:'Roménia', HU:'Hungria',
  UA:'Ucrânia', LV:'Letónia', LT:'Lituânia', EE:'Estónia', SK:'Eslováquia',
  SI:'Eslovénia', HR:'Croácia', RS:'Sérvia', BG:'Bulgária', GR:'Grécia',
  TR:'Turquia', RU:'Rússia', JP:'Japão', KR:'Coreia do Sul', SG:'Singapura',
  CA:'Canadá', MX:'México', AR:'Argentina'
};

function resolveCountry(endpoint) {
  if (!endpoint) return Promise.resolve({ country: '', countryName: '' });
  const host = endpoint.split(':')[0];
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost)/.test(host))
    return Promise.resolve({ country: '', countryName: '' });
  return new Promise((resolve) => {
    const req = https.get(`https://ipinfo.io/${host}/json`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const c = j.country || '';
          resolve({ country: c, countryName: COUNTRY_NAMES[c] || c });
        } catch { resolve({ country: '', countryName: '' }); }
      });
    });
    req.on('error', () => resolve({ country: '', countryName: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ country: '', countryName: '' }); });
  });
}

module.exports = { resolveCountry, COUNTRY_NAMES };
