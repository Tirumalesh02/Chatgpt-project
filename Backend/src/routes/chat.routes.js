const express = require('express');
const router = express.Router();
const {authUser} = require('../middlewares/auth.middleware');
const { createChat, getChats , getMessages} = require('../controllers/chat.controllers');

router.post('/', authUser, createChat);
router.get('/', authUser, getChats);
router.get('/:id', authUser, getMessages);

module.exports = router;