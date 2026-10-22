const express = require('express');
const router = express.Router();
const shiprocketService = require('../services/shiprocketService');
const ShipmentWebhookLog = require('../models/ShipmentWebhookLog');

router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
    const receivedToken =
      req.headers['x-api-key'] ||
      req.headers.authorization?.replace('Bearer ', '') ||
      req.query.token ||
      req.body?.token;

    if (expectedToken && receivedToken !== expectedToken) {
      console.warn('⚠️ Webhook rejected: invalid token');
      return res.status(401).json({ error: 'Invalid webhook token' });
    }

    const payload = req.body;
    console.log('📨 Shiprocket webhook received:', {
      awb: payload.awb || payload.awb_code,
      status: payload.current_status,
      code: payload.current_status_id
    });

    let logDoc = null;
    try {
      logDoc = await ShipmentWebhookLog.create({
        awb: payload.awb || payload.awb_code || '',
        currentStatus: payload.current_status || '',
        currentStatusCode: parseInt(payload.current_status_id) || 0,
        payload,
        processed: false
      });
    } catch (logErr) {
      console.error('Webhook log save error:', logErr.message);
    }

    const result = await shiprocketService.handleWebhookEvent(payload);

    if (logDoc) {
      logDoc.processed = result.success;
      logDoc.error = result.reason || '';
      await logDoc.save();
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Webhook processed in ${elapsed}ms:`, result);

    return res.status(200).json({
      received: true,
      processed: result.success,
      elapsed: `${elapsed}ms`
    });

  } catch (err) {
    console.error('❌ Webhook uncaught error:', err);
    return res.status(200).json({
      received: true,
      processed: false,
      error: err.message
    });
  }
});

router.get('/', (req, res) => {
  res.json({ status: 'Shiprocket webhook endpoint is live' });
});

module.exports = router;