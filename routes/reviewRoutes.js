const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// ============================================
// PUBLIC ROUTES - Get reviews for a product
// ============================================
router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'newest' } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    let sortOption = { createdAt: -1 };
    
    if (sort === 'oldest') sortOption = { createdAt: 1 };
    else if (sort === 'highest') sortOption = { rating: -1 };
    else if (sort === 'lowest') sortOption = { rating: 1 };
    else if (sort === 'helpful') sortOption = { helpfulCount: -1 };
    
    const reviews = await Review.find({ 
      productId, 
      isDeleted: false,
      isApproved: true 
    })
    .populate('userId', 'name avatar')
    .sort(sortOption)
    .skip(skip)
    .limit(parseInt(limit));
    
    const total = await Review.countDocuments({ 
      productId, 
      isDeleted: false,
      isApproved: true 
    });
    
    const stats = await Review.aggregate([
      { $match: { productId: productId, isDeleted: false, isApproved: true } },
      { $group: {
        _id: null,
        average: { $avg: '$rating' },
        total: { $sum: 1 },
        distribution: {
          $push: '$rating'
        }
      }}
    ]);
    
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (stats.length > 0) {
      stats[0].distribution.forEach(r => {
        if (distribution[r] !== undefined) distribution[r]++;
      });
    }
    
    res.json({
      reviews,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      stats: stats.length > 0 ? {
        average: Math.round(stats[0].average * 10) / 10,
        total: stats[0].total,
        distribution
      } : {
        average: 0,
        total: 0,
        distribution
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ✅ CHECK IF USER CAN REVIEW
// ============================================
router.get('/can-review/:productId', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.json({ canReview: false, reason: 'Please login to review' });
    }
    
    // Check if user has purchased this product
    const orders = await Order.find({
      userId,
      status: { $in: ['delivered'] },
      'items.productId': req.params.productId,
      'items.isReviewed': { $ne: true }
    });
    
    if (orders.length === 0) {
      return res.json({ canReview: false, reason: 'You need to purchase this product to review' });
    }
    
    // Check if already reviewed
    const existingReview = await Review.findOne({
      productId: req.params.productId,
      userId,
      isDeleted: false
    });
    
    if (existingReview) {
      return res.json({ canReview: false, reason: 'You have already reviewed this product' });
    }
    
    // Find reviewable items
    const reviewableItems = [];
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId.toString() === req.params.productId && !item.isReviewed) {
          reviewableItems.push({
            orderId: order._id,
            orderItemId: item._id,
            orderDate: order.createdAt
          });
        }
      });
    });
    
    if (reviewableItems.length === 0) {
      return res.json({ canReview: false, reason: 'You have already reviewed all your purchases of this product' });
    }
    
    res.json({ 
      canReview: true, 
      reviewableItems,
      order: orders[0]
    });
  } catch (err) {
    console.error('Can review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTHENTICATED ROUTES
// ============================================

// Submit a review
router.post('/submit', async (req, res) => {
  try {
    const { productId, orderId, orderItemId, rating, title, comment, images } = req.body;
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Please login to review' });
    }
    
    // Verify purchase
    const order = await Order.findOne({
      _id: orderId,
      userId,
      status: 'delivered'
    });
    
    if (!order) {
      return res.status(403).json({ error: 'You must purchase this product to review' });
    }
    
    // Verify order item belongs to this product
    const orderItem = order.items.id(orderItemId);
    if (!orderItem || orderItem.productId.toString() !== productId) {
      return res.status(400).json({ error: 'Invalid order item' });
    }
    
    if (orderItem.isReviewed) {
      return res.status(400).json({ error: 'You have already reviewed this item' });
    }
    
    // Create review
    const review = new Review({
      productId,
      userId,
      orderId,
      orderItemId,
      rating,
      title: title || '',
      comment: comment || '',
      images: images || [],
      isVerified: true,
      isApproved: true
    });
    
    await review.save();
    
    // Mark order item as reviewed
    orderItem.isReviewed = true;
    await order.save();
    
    // Update product rating
    const product = await Product.findById(productId);
    if (product) {
      const allReviews = await Review.find({ productId, isDeleted: false, isApproved: true });
      const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      product.avgRating = Math.round(avg * 10) / 10;
      product.reviewCount = allReviews.length;
      await product.save();
    }
    
    // Add to user's review list
    await User.findByIdAndUpdate(userId, { $push: { reviewIds: review._id } });
    
    res.status(201).json({ 
      success: true, 
      message: 'Review submitted successfully!',
      review 
    });
  } catch (err) {
    console.error('Submit review error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's reviews
router.get('/my-reviews', async (req, res) => {
  try {
    const userId = req.userId;
    const reviews = await Review.find({ userId, isDeleted: false })
      .populate('productId', 'name image productId')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all reviews (admin)
router.get('/admin/all', async (req, res) => {
  try {
    const reviews = await Review.find({ isDeleted: false })
      .populate('userId', 'name email')
      .populate('productId', 'name productId')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get review analytics (admin)
router.get('/admin/analytics', async (req, res) => {
  try {
    const total = await Review.countDocuments({ isDeleted: false });
    const verified = await Review.countDocuments({ isVerified: true });
    const unverified = total - verified;
    
    const ratingStats = await Review.aggregate([
      { $match: { isDeleted: false } },
      { $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }}
    ]);
    
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingStats.forEach(r => {
      if (distribution[r._id] !== undefined) distribution[r._id] = r.count;
    });
    
    const avg = await Review.aggregate([
      { $match: { isDeleted: false } },
      { $group: {
        _id: null,
        average: { $avg: '$rating' },
        total: { $sum: 1 }
      }}
    ]);
    
    const monthly = await Review.aggregate([
      { $match: { isDeleted: false } },
      { $group: {
        _id: { 
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 },
        average: { $avg: '$rating' }
      }},
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 }
    ]);
    
    res.json({
      total,
      verified,
      unverified,
      average: avg.length > 0 ? Math.round(avg[0].average * 10) / 10 : 0,
      distribution,
      monthly: monthly.reverse()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete review (admin)
router.delete('/admin/:reviewId', async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    review.isDeleted = true;
    await review.save();
    
    const product = await Product.findById(review.productId);
    if (product) {
      const allReviews = await Review.find({ 
        productId: product._id, 
        isDeleted: false, 
        isApproved: true 
      });
      if (allReviews.length > 0) {
        const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
        product.avgRating = Math.round(avg * 10) / 10;
        product.reviewCount = allReviews.length;
      } else {
        product.avgRating = 0;
        product.reviewCount = 0;
      }
      await product.save();
    }
    
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle review approval (admin)
router.patch('/admin/:reviewId/toggle-approval', async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }
    review.isApproved = !review.isApproved;
    await review.save();
    res.json({ isApproved: review.isApproved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;