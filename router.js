const express = require('express');
const router = express.Router();

// Basic route
router.get('/', (req, res) => {
    res.send('Router is working');
});

module.exports = router; 