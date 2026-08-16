const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// ============================================
// PUBLIC - Get active notifications
// ============================================
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const notifications = await Notification.find({
      isActive: true,
      isDeleted: false,
      publishDate: { $lte: now },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ]
    })
    .sort({ priority: -1, createdAt: -1 })
    .limit(10);
    
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN - Get all notifications
// ============================================
router.get('/admin', async (req, res) => {
  try {
    const notifications = await Notification.find({ isDeleted: false })
      .sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN - Create notification
// ============================================
router.post('/', async (req, res) => {
  try {
    const { message, type, priority, targetType, link, isDismissible, publishDate, expiryDate } = req.body;
    
    const notification = new Notification({
      message,
      type: type || 'info',
      priority: priority || 'medium',
      targetType: targetType || 'all',
      link: link || '',
      isDismissible: isDismissible !== undefined ? isDismissible : true,
      publishDate: publishDate || new Date(),
      expiryDate: expiryDate || null
    });
    
    await notification.save();
    res.status(201).json(notification);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================
// ADMIN - Delete notification
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, isActive: false }
    );
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN - Toggle notification status
// ============================================
router.patch('/:id/toggle', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    notification.isActive = !notification.isActive;
    await notification.save();
    res.json({ isActive: notification.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN - Get notification analytics
// ============================================
router.get('/admin/analytics', async (req, res) => {
  try {
    const total = await Notification.countDocuments({ isDeleted: false });
    const active = await Notification.countDocuments({ isActive: true, isDeleted: false });
    const expired = await Notification.countDocuments({ 
      isDeleted: false,
      expiryDate: { $lt: new Date() }
    });
    
    res.json({ total, active, expired });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;