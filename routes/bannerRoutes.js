const express = require('express');
const router = express.Router();
const Banner = require('../models/Banner');

// ============================================
// PUBLIC ROUTES
// ============================================

// GET all active banners for homepage
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const banners = await Banner.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      $or: [
        { endDate: null },
        { endDate: { $gte: now } }
      ]
    })
    .sort({ priority: -1, createdAt: -1 });
    
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single banner by ID (for preview)
router.get('/:id', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// GET all banners (admin)
router.get('/', async (req, res) => {
  try {
    const banners = await Banner.find().sort({ priority: -1, createdAt: -1 });
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE banner
router.post('/', async (req, res) => {
  try {
    const banner = new Banner(req.body);
    await banner.save();
    res.status(201).json(banner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// UPDATE banner
router.put('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    res.json(banner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE banner (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, isActive: false }
    );
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    res.json({ message: 'Banner deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TOGGLE banner status
router.patch('/:id/toggle', async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    banner.isActive = !banner.isActive;
    await banner.save();
    res.json({ isActive: banner.isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE priority (reorder)
router.patch('/:id/priority', async (req, res) => {
  try {
    const { priority } = req.body;
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { priority },
      { new: true }
    );
    if (!banner) return res.status(404).json({ error: 'Banner not found' });
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TRACK click
router.post('/:id/click', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $inc: { clicks: 1 } },
      { new: true }
    );
    res.json({ clicks: banner.clicks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TRACK impression
router.post('/:id/impression', async (req, res) => {
  try {
    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $inc: { impressions: 1 } },
      { new: true }
    );
    res.json({ impressions: banner.impressions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;