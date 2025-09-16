const express = require('express');
const router = express.Router();
const { register, login, status, logout } = require('../controllers/auth.controllers');
const { authUser } = require('../middlewares/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.get('/status', authUser, status);
router.post('/logout', authUser, logout);

module.exports = router;