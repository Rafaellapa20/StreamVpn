const jwt = require('jsonwebtoken');

// Sem fallback: um segredo previsível permitiria forjar tokens de admin.
// Falha alto e cedo em vez de arrancar silenciosamente com um segredo fraco.
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET em falta ou demasiado curto (mínimo 32 caracteres). ' +
    'Define uma variável de ambiente JWT_SECRET forte antes de arrancar o servidor. ' +
    'Ex.: gera uma com `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"`'
  );
}

// Autenticação: verifica o JWT e coloca { _id, email, role } em req.user
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

// Só admins
const adminAuth = (req, res, next) => auth(req, res, () => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso reservado a administradores' });
  next();
});

const sign = (user, expiresIn = '30d') => jwt.sign(
  { _id: user._id.toString(), username: user.username, email: user.email, role: user.role, name: user.name },
  SECRET, { expiresIn }
);

module.exports = auth;
module.exports.auth = auth;
module.exports.adminAuth = adminAuth;
module.exports.sign = sign;
