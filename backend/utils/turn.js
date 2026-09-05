const crypto = require('crypto');

/**
 * Gera credenciais TURN temporárias (esquema "REST API" do coturn:
 * use-auth-secret / static-auth-secret). Nunca é uma password fixa —
 * expira sozinha ao fim de ttlSeconds.
 */
function generateTurnCredentials(label, ttlSeconds = 3600) {
  const secret = process.env.TURN_SECRET;
  if (!secret) throw new Error('TURN_SECRET em falta no .env');
  const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${label}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  const host = process.env.TURN_HOST || 'streamvpn.faktio.ch';
  const port = process.env.TURN_PORT || '3478';
  return {
    username,
    credential,
    ttl: ttlSeconds,
    urls: [`turn:${host}:${port}?transport=udp`, `stun:${host}:${port}`]
  };
}

module.exports = { generateTurnCredentials };
