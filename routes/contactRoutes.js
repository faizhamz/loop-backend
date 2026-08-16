const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');

// ============================================
// PUBLIC ROUTE - Get contact info
// ============================================
router.get('/', async (req, res) => {
  try {
    const contact = await Contact.getDefault();
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES - Update contact info
// ============================================
router.put('/admin', async (req, res) => {
  try {
    const contact = await Contact.getDefault();
    const updates = req.body;
    
    // Only update fields that are provided
    Object.keys(updates).forEach(key => {
      if (key !== '_id' && key !== '__v') {
        contact[key] = updates[key];
      }
    });
    
    contact.updatedAt = new Date();
    await contact.save();
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;