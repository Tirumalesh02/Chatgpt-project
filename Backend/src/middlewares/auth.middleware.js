const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');

function extractToken(req) {
    if (req.cookies && req.cookies.token) return req.cookies.token;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.substring(7);
    if (req.headers['x-auth-token']) return req.headers['x-auth-token'];
    if (req.headers['auth-token']) return req.headers['auth-token'];
    return null;
}

async function authUser(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId).lean();
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        req.user = user;
        return next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}

module.exports = { authUser };