const express = require('express');
const router = express.Router();
const { DailyAnalytics, AnalyticsEvent } = require('../models/Analytics');
const Product = require('../models/Product');
const Banner = require('../models/Banner');

// ============================================
// TRACKING ENDPOINTS
// ============================================

// ✅ Track product view
router.post('/track/product-view', async (req, res) => {
  try {
    const { productId, visitorId, userId } = req.body;
    
    if (!productId || !visitorId) {
      return res.status(400).json({ error: 'Product ID and visitor ID required' });
    }

    // 1. Update product real-time count
    await Product.findByIdAndUpdate(productId, {
      $inc: { totalViews: 1 }
    });

    // 2. Log event
    await AnalyticsEvent.create({
      eventType: 'product_view',
      productId,
      visitorId,
      userId: userId || null
    });

    // 3. Update daily aggregation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let daily = await DailyAnalytics.findOne({ date: today });
    if (!daily) {
      daily = new DailyAnalytics({ date: today });
    }
    
    const views = daily.productViews || {};
    views[productId] = (views[productId] || 0) + 1;
    daily.productViews = views;
    await daily.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking product view:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Track banner click
router.post('/track/banner-click', async (req, res) => {
  try {
    const { bannerId, visitorId, userId } = req.body;
    
    if (!bannerId || !visitorId) {
      return res.status(400).json({ error: 'Banner ID and visitor ID required' });
    }

    // 1. Update banner real-time count
    await Banner.findByIdAndUpdate(bannerId, {
      $inc: { totalClicks: 1, uniqueClickers: 1 }
    });

    // 2. Log event
    await AnalyticsEvent.create({
      eventType: 'banner_click',
      bannerId,
      visitorId,
      userId: userId || null
    });

    // 3. Update daily aggregation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let daily = await DailyAnalytics.findOne({ date: today });
    if (!daily) {
      daily = new DailyAnalytics({ date: today });
    }
    
    const clicks = daily.bannerClicks || {};
    clicks[bannerId] = (clicks[bannerId] || 0) + 1;
    daily.bannerClicks = clicks;
    await daily.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking banner click:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Track unique visitor
router.post('/track/visitor', async (req, res) => {
  try {
    const { visitorId, userId } = req.body;
    
    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID required' });
    }

    // Check if visitor already tracked today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const existingEvent = await AnalyticsEvent.findOne({
      eventType: 'visitor',
      visitorId,
      timestamp: { $gte: today }
    });

    if (!existingEvent) {
      // Log new visitor
      await AnalyticsEvent.create({
        eventType: 'visitor',
        visitorId,
        userId: userId || null
      });

      // Update daily unique visitors
      let daily = await DailyAnalytics.findOne({ date: today });
      if (!daily) {
        daily = new DailyAnalytics({ date: today });
      }
      daily.uniqueVisitors = (daily.uniqueVisitors || 0) + 1;
      await daily.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error tracking visitor:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// ANALYTICS QUERY ENDPOINTS
// ============================================

// ✅ Get analytics summary
router.get('/summary', async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get daily analytics
    const dailyData = await DailyAnalytics.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });

    // Aggregate totals
    let totalUniqueVisitors = 0;
    const productViews = {};
    const bannerClicks = {};

    dailyData.forEach(day => {
      totalUniqueVisitors += day.uniqueVisitors || 0;
      
      if (day.productViews) {
        for (const [key, value] of day.productViews) {
          productViews[key] = (productViews[key] || 0) + value;
        }
      }
      
      if (day.bannerClicks) {
        for (const [key, value] of day.bannerClicks) {
          bannerClicks[key] = (bannerClicks[key] || 0) + value;
        }
      }
    });

    // Get top products
    const topProductIds = Object.keys(productViews)
      .sort((a, b) => productViews[b] - productViews[a])
      .slice(0, 10);
    
    const topProducts = await Product.find({
      _id: { $in: topProductIds }
    }).select('productId name image');

    // Get top banners
    const topBannerIds = Object.keys(bannerClicks)
      .sort((a, b) => bannerClicks[b] - bannerClicks[a])
      .slice(0, 10);
    
    const topBanners = await Banner.find({
      _id: { $in: topBannerIds }
    }).select('title image bannerType');

    // Get active users (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeUsers = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: fiveMinutesAgo }
    });

    // Chart data
    const chartData = dailyData.map(day => ({
      date: day.date,
      visitors: day.uniqueVisitors || 0
    }));

    res.json({
      summary: {
        totalUniqueVisitors,
        activeUsers: activeUsers.length,
        totalProductViews: Object.values(productViews).reduce((a, b) => a + b, 0),
        totalBannerClicks: Object.values(bannerClicks).reduce((a, b) => a + b, 0)
      },
      topProducts: topProducts.map(p => ({
        ...p.toObject(),
        views: productViews[p._id] || 0
      })),
      topBanners: topBanners.map(b => ({
        ...b.toObject(),
        clicks: bannerClicks[b._id] || 0
      })),
      chartData,
      period
    });
  } catch (err) {
    console.error('Error fetching analytics summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all events (for debugging)
router.get('/events', async (req, res) => {
  try {
    const events = await AnalyticsEvent.find()
      .sort({ timestamp: -1 })
      .limit(100);
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get product analytics
router.get('/products', async (req, res) => {
  try {
    const { productId } = req.query;
    
    if (productId) {
      // Get specific product analytics
      const product = await Product.findById(productId).select('productId name totalViews uniqueViewers');
      const events = await AnalyticsEvent.find({
        eventType: 'product_view',
        productId
      }).sort({ timestamp: -1 }).limit(100);
      
      res.json({
        product,
        events,
        totalViews: product?.totalViews || 0
      });
    } else {
      // Get all product analytics
      const products = await Product.find()
        .select('productId name totalViews')
        .sort({ totalViews: -1 })
        .limit(50);
      
      res.json(products);
    }
  } catch (err) {
    console.error('Error fetching product analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get banner analytics
router.get('/banners', async (req, res) => {
  try {
    const { bannerId } = req.query;
    
    if (bannerId) {
      // Get specific banner analytics
      const banner = await Banner.findById(bannerId).select('title totalClicks uniqueClickers');
      const events = await AnalyticsEvent.find({
        eventType: 'banner_click',
        bannerId
      }).sort({ timestamp: -1 }).limit(100);
      
      res.json({
        banner,
        events,
        totalClicks: banner?.totalClicks || 0
      });
    } else {
      // Get all banner analytics
      const banners = await Banner.find()
        .select('title totalClicks uniqueClickers')
        .sort({ totalClicks: -1 })
        .limit(50);
      
      res.json(banners);
    }
  } catch (err) {
    console.error('Error fetching banner analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Manual daily update
router.post('/daily/update', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all events for today
    const events = await AnalyticsEvent.find({
      timestamp: { $gte: today }
    });
    
    // Count unique visitors
    const uniqueVisitors = [...new Set(events.map(e => e.visitorId))];
    
    // Count product views
    const productViews = {};
    const bannerClicks = {};
    
    events.forEach(e => {
      if (e.eventType === 'product_view' && e.productId) {
        productViews[e.productId] = (productViews[e.productId] || 0) + 1;
      }
      if (e.eventType === 'banner_click' && e.bannerId) {
        bannerClicks[e.bannerId] = (bannerClicks[e.bannerId] || 0) + 1;
      }
    });
    
    // Update daily summary
    let daily = await DailyAnalytics.findOne({ date: today });
    if (!daily) {
      daily = new DailyAnalytics({ date: today });
    }
    daily.uniqueVisitors = uniqueVisitors.length;
    daily.productViews = productViews;
    daily.bannerClicks = bannerClicks;
    await daily.save();
    
    res.json({ 
      success: true, 
      uniqueVisitors: uniqueVisitors.length,
      productViews,
      bannerClicks
    });
  } catch (err) {
    console.error('Error updating daily summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get active users count
router.get('/active-users', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeUsers = await AnalyticsEvent.distinct('visitorId', {
      timestamp: { $gte: fiveMinutesAgo }
    });
    
    res.json({ activeUsers: activeUsers.length });
  } catch (err) {
    console.error('Error fetching active users:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 
