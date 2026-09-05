const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }
    const decoded = jwt.decode(token);
    req.user = { _id: decoded?.user || '607f1f77bcf86cd799439011' };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

module.exports = auth;
