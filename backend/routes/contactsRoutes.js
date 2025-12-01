const express = require('express');
const { addContact, listContacts } = require('../controllers/contactsController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/add', protect, addContact);
router.get('/list', protect, listContacts);

module.exports = router;
