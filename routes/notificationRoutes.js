const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');

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
// AUTH - Get user-specific notifications
// ============================================
router.get('/user', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.json([]);
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.json([]);
    }
    
    // Get read notification IDs
    const readIds = user.readNotifications?.map(r => r.notificationId.toString()) || [];
    
    const now = new Date();
    const notifications = await Notification.find({
      isActive: true,
      isDeleted: false,
      publishDate: { $lte: now },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ],
      $or: [
        { targetType: 'all' },
        { targetType: 'logged-in', targetUserIds: userId },
        { targetType: 'specific', targetUserIds: userId }
      ]
    })
    .sort({ priority: -1, createdAt: -1 })
    .limit(20);
    
    // Add read status
    const notificationsWithStatus = notifications.map(n => ({
      ...n.toObject(),
      isRead: readIds.includes(n._id.toString())
    }));
    
    res.json(notificationsWithStatus);
  } catch (err) {
    console.error('Error fetching user notifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTH - Get unread count
// ============================================
router.get('/unread-count', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.json({ count: 0 });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ count: 0 });
    }
    
    const readIds = user.readNotifications?.map(r => r.notificationId.toString()) || [];
    
    const now = new Date();
    const total = await Notification.countDocuments({
      isActive: true,
      isDeleted: false,
      publishDate: { $lte: now },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ],
      $or: [
        { targetType: 'all' },
        { targetType: 'logged-in', targetUserIds: userId },
        { targetType: 'specific', targetUserIds: userId }
      ],
      _id: { $nin: readIds }
    });
    
    res.json({ count: total });
  } catch (err) {
    console.error('Error getting unread count:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTH - Mark notification as read
// ============================================
router.post('/mark-read/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    const { id } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if already read
    const alreadyRead = user.readNotifications?.some(
      r => r.notificationId.toString() === id
    );
    
    if (!alreadyRead) {
      user.readNotifications = user.readNotifications || [];
      user.readNotifications.push({
        notificationId: id,
        readAt: new Date()
      });
      await user.save();
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notification read:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTH - Mark all notifications as read
// ============================================
router.post('/mark-all-read', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const now = new Date();
    
    // Get all active notifications
    const notifications = await Notification.find({
      isActive: true,
      isDeleted: false,
      publishDate: { $lte: now },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ],
      $or: [
        { targetType: 'all' },
        { targetType: 'logged-in', targetUserIds: userId },
        { targetType: 'specific', targetUserIds: userId }
      ]
    });
    
    // Add all to read list
    user.readNotifications = user.readNotifications || [];
    notifications.forEach(n => {
      const alreadyRead = user.readNotifications.some(
        r => r.notificationId.toString() === n._id.toString()
      );
      if (!alreadyRead) {
        user.readNotifications.push({
          notificationId: n._id,
          readAt: new Date()
        });
      }
    });
    
    await user.save();
    
    res.json({ success: true, count: notifications.length });
  } catch (err) {
    console.error('Error marking all notifications read:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ NEW: AUTH - Clear all notifications (DELETE)
// ============================================
router.delete('/clear-all', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;
    
    // Delete all notifications targeting this user
    const result = await Notification.deleteMany({
      isDeleted: false,
      $or: [
        { targetType: 'all' },
        { targetType: 'logged-in', targetUserIds: userId },
        { targetType: 'specific', targetUserIds: userId }
      ]
    });
    
    // Also clear read notifications tracking
    await User.findByIdAndUpdate(userId, {
      $set: { readNotifications: [] }
    });
    
    res.json({ 
      success: true, 
      message: 'All notifications cleared',
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    console.error('Error clearing notifications:', err);
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
    const { message, type, priority, targetType, targetUserIds, link, isDismissible, publishDate, expiryDate, orderId, orderStatus } = req.body;
    
    const notification = new Notification({
      message,
      type: type || 'info',
      priority: priority || 'medium',
      targetType: targetType || 'all',
      targetUserIds: targetUserIds || [],
      link: link || '',
      isDismissible: isDismissible !== undefined ? isDismissible : true,
      publishDate: publishDate || new Date(),
      expiryDate: expiryDate || null,
      orderId: orderId || null,
      orderStatus: orderStatus || ''
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