const User = require('../models/User');

const checkQuotaLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.quota) return next();
    if (user.quota.usedBandwidth >= user.quota.monthlyBandwidth) {
      return res.status(403).json({ error: 'Quota excedida' });
    }
    next();
  } catch (err) {
    next();
  }
};

module.exports = { checkQuotaLimit };
