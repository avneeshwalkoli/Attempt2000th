const express = require('express');
const { linkContact, listContactLinks } = require('../controllers/contactLinkController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, linkContact);
router.get('/', protect, listContactLinks);

module.exports = router;


