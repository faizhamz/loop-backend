// ============================================
// SHIPROCKET API CLIENT
// ============================================
// Handles authentication (token cached + auto-refresh),
// all API calls, and graceful degradation when
// credentials are missing (returns mock responses).

const axios = require('axios');

const SHIPROCKET_BASE = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiry = null;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // 9 days (Shiprocket tokens last ~10 days)

// ============================================
// Check if Shiprocket is configured
// ============================================
const isConfigured = () => {
  return !!(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
};

// ============================================
// Auth: Login and cache token
// ============================================
const authenticate = async () => {
  if (!isConfigured()) {
    console.warn('⚠️ Shiprocket not configured (missing SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)');
    return null;
  }

  // Return cached token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await axios.post(`${SHIPROCKET_BASE}/auth/login`, {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD
    });

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      tokenExpiry = Date.now() + TOKEN_TTL_MS;
      console.log('✅ Shiprocket authenticated');
      return cachedToken;
    }

    throw new Error('No token in Shiprocket login response');
  } catch (err) {
    console.error('❌ Shiprocket auth error:', err.response?.data || err.message);
    cachedToken = null;
    tokenExpiry = null;
    throw err;
  }
};

// ============================================
// Auth header helper
// ============================================
const getAuthHeader = async () => {
  const token = await authenticate();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

// ============================================
// Generic request wrapper
// ============================================
const request = async (method, endpoint, data = null, params = null) => {
  if (!isConfigured()) {
    throw new Error('Shiprocket is not configured. Please add API credentials to .env');
  }

  try {
    const headers = await getAuthHeader();
    const config = {
      method,
      url: `${SHIPROCKET_BASE}${endpoint}`,
      headers: { ...headers, 'Content-Type': 'application/json' },
      timeout: 30000
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return response.data;
  } catch (err) {
    // If 401, token might be expired - retry once
    if (err.response?.status === 401) {
      console.log('🔄 Token expired, re-authenticating...');
      cachedToken = null;
      tokenExpiry = null;
      const headers = await getAuthHeader();
      const retryConfig = {
        method,
        url: `${SHIPROCKET_BASE}${endpoint}`,
        headers: { ...headers, 'Content-Type': 'application/json' },
        timeout: 30000
      };
      if (data) retryConfig.data = data;
      if (params) retryConfig.params = params;
      const retryResponse = await axios(retryConfig);
      return retryResponse.data;
    }

    console.error(`❌ Shiprocket ${method} ${endpoint} error:`, err.response?.data || err.message);
    throw err;
  }
};

// ============================================
// SERVICEBILITY / PINCODE CHECK
// ============================================
const checkServiceability = async ({ pickupPincode, deliveryPincode, weight = 0.5, cod = 0 }) => {
  return request('GET', '/courier/serviceability/', null, {
    pickup_postcode: pickupPincode,
    delivery_postcode: deliveryPincode,
    weight,
    cod
  });
};

// ============================================
// CREATE SHIPMENT (ad-hoc)
// ============================================
const createShipment = async (orderData) => {
  return request('POST', '/orders/create/adhoc', orderData);
};

// ============================================
// GENERATE PICKUP REQUEST
// ============================================
const generatePickup = async ({ shipmentId }) => {
  return request('POST', '/courier/generate/pickup', { shipment_id: [shipmentId] });
};

// ============================================
// GENERATE LABEL
// ============================================
const generateLabel = async ({ shipmentId }) => {
  return request('POST', '/courier/generate/label', { shipment_id: [shipmentId] });
};

// ============================================
// GENERATE MANIFEST
// ============================================
const generateManifest = async ({ shipmentId }) => {
  return request('POST', '/manifests/generate', { shipment_id: [shipmentId] });
};

// ============================================
// TRACK BY AWB
// ============================================
const trackByAwb = async (awbCode) => {
  return request('GET', `/courier/track/awb/${awbCode}`);
};

// ============================================
// CANCEL SHIPMENT
// ============================================
const cancelShipment = async (awbCodes) => {
  return request('POST', '/orders/cancel', { awbs: awbCodes });
};

// ============================================
// CREATE RETURN ORDER (Reverse Pickup)
// ============================================
const createReturnOrder = async (returnData) => {
  return request('POST', '/orders/create/return', returnData);
};

// ============================================
// CANCEL RETURN
// ============================================
const cancelReturn = async (orderId) => {
  return request('POST', '/orders/cancel/return', { order_id: orderId });
};

// ============================================
// GET NDR LIST
// ============================================
const getNDRList = async (params = {}) => {
  return request('GET', '/ndr/all', null, params);
};

// ============================================
// ADD NDR ACTION (reattempt / change address / return)
// ============================================
const addNDRAction = async ({ awb, action, comments = '', phone = '', address = null }) => {
  const payload = {
    awb,
    ndr_action: action, // "RE-ATTEMPT" | "CHANGE_ADDRESS" | "RETURN"
    ndr_comments: comments,
    customer_phone: phone
  };
  if (action === 'CHANGE_ADDRESS' && address) {
    payload.address = address;
  }
  return request('POST', '/ndr/add-ndr-action', payload);
};

// ============================================
// GET WALLET BALANCE
// ============================================
const getWalletBalance = async () => {
  return request('GET', '/account/details');
};

module.exports = {
  isConfigured,
  authenticate,
  checkServiceability,
  createShipment,
  generatePickup,
  generateLabel,
  generateManifest,
  trackByAwb,
  cancelShipment,
  createReturnOrder,
  cancelReturn,
  getNDRList,
  addNDRAction,
  getWalletBalance
};