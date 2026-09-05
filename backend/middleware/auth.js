const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

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

const sign = (user) => jwt.sign(
  { _id: user._id.toString(), email: user.email, role: user.role, name: user.name },
  SECRET, { expiresIn: '30d' }
);

module.exports = auth;
module.exports.auth = auth;
module.exports.adminAuth = adminAuth;
module.exports.sign = sign;
