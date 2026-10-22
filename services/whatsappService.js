// ============================================
// WHATSAPP CLOUD API SERVICE
// ============================================
// Sends template messages via Meta's WhatsApp Cloud API.
// Requires approved templates in Meta Business Manager.
// Gracefully skips if not configured.

const axios = require('axios');

const API_VERSION = 'v20.0';

const isConfigured = () => {
  return !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID
  );
};

// ============================================
// CLEAN PHONE (10-digit Indian → E.164)
// ============================================
const normalizePhone = (phone) => {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length === 11 && digits.startsWith('0')) digits = '91' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 13 && digits.startsWith('091')) return '91' + digits.slice(3);
  return digits;
};

// ============================================
// SEND TEMPLATE MESSAGE
// ============================================
const sendTemplate = async ({ to, templateName, languageCode = 'en', components = [] }) => {
  if (!isConfigured()) {
    console.log(`💬 [SKIPPED - not configured] To: ${to} | Template: ${templateName}`);
    return { skipped: true };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    console.log('💬 Invalid phone:', to);
    return null;
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log(`💬 WhatsApp sent to ${phone}:`, response.data?.messages?.[0]?.id);
    return response.data;
  } catch (err) {
    console.error('💬 WhatsApp error:', err.response?.data || err.message);
    return null;
  }
};

// ============================================
// TEMPLATE MAPPINGS
// ============================================
// NOTE: Template names MUST match EXACTLY what you register in Meta.
// Body parameters are positional {{1}}, {{2}}, etc.
// Buttons are appended as component type "button" if the template has dynamic URL buttons.

const templates = {
  // ────────────── ORDER CONFIRMED ──────────────
  // Meta template name: loop_order_confirmed
  // Body params: {{1}} name, {{2}} orderId, {{3}} total
  order_confirmed: (order) => ({
    templateName: 'loop_order_confirmed',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId },
          { type: 'text', text: `₹${order.total}` }
        ]
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: order.orderId }]
      }
    ]
  }),

  // ────────────── ORDER SHIPPED ──────────────
  // Meta template name: loop_order_shipped
  // Body params: {{1}} name, {{2}} orderId, {{3}} courier, {{4}} awb
  order_shipped: (order) => ({
    templateName: 'loop_order_shipped',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId },
          { type: 'text', text: order.shiprocket?.courierName || order.tracking?.courierName || 'our courier' },
          { type: 'text', text: order.shiprocket?.awbCode || order.tracking?.number || 'N/A' }
        ]
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: order.shiprocket?.awbCode || order.tracking?.number || '' }]
      }
    ]
  }),

  // ────────────── OUT FOR DELIVERY ──────────────
  // Meta template name: loop_out_for_delivery
  // Body params: {{1}} name, {{2}} orderId
  order_out_for_delivery: (order) => ({
    templateName: 'loop_out_for_delivery',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId }
        ]
      }
    ]
  }),

  // ────────────── DELIVERED ──────────────
  // Meta template name: loop_order_delivered
  // Body params: {{1}} name, {{2}} orderId
  order_delivered: (order) => ({
    templateName: 'loop_order_delivered',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId }
        ]
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: order.orderId }]
      }
    ]
  }),

  // ────────────── NDR ──────────────
  // Meta template name: loop_delivery_failed
  // Body params: {{1}} name, {{2}} orderId
  order_ndr: (order) => ({
    templateName: 'loop_delivery_failed',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId }
        ]
      }
    ]
  }),

  // ────────────── CANCELLED ──────────────
  // Meta template name: loop_order_cancelled
  // Body params: {{1}} name, {{2}} orderId
  order_cancelled: (order) => ({
    templateName: 'loop_order_cancelled',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId }
        ]
      }
    ]
  }),

  // ────────────── RETURNED ──────────────
  // Meta template name: loop_return_initiated
  // Body params: {{1}} name, {{2}} orderId
  order_returned: (order) => ({
    templateName: 'loop_return_initiated',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.orderId }
        ]
      }
    ]
  }),

  // ────────────── WELCOME BONUS ──────────────
  // Meta template name: loop_welcome_bonus
  // Body params: {{1}} name, {{2}} amount
  welcome_bonus: (order) => ({
    templateName: 'loop_welcome_bonus',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: `₹${order.welcomeAmount || 50}` }
        ]
      }
    ]
  }),

  // ────────────── REFERRAL REWARD ──────────────
  // Meta template name: loop_referral_reward
  // Body params: {{1}} name, {{2}} friendName, {{3}} amount
  referral_reward: (order) => ({
    templateName: 'loop_referral_reward',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer?.name?.split(' ')[0] || 'there' },
          { type: 'text', text: order.friendName || 'your friend' },
          { type: 'text', text: `₹${order.rewardAmount || 100}` }
        ]
      }
    ]
  })
};

// ============================================
// SEND STATUS WHATSAPP
// ============================================
const sendWhatsAppStatus = async (order, emailType) => {
  const template = templates[emailType];
  if (!template) {
    console.log(`💬 No WhatsApp template for ${emailType}`);
    return null;
  }

  const phone = order.customer?.phone;
  if (!phone) {
    console.log('💬 No customer phone — skipping');
    return null;
  }

  const { templateName, components } = template(order);
  return sendTemplate({
    to: phone,
    templateName,
    components
  });
};

module.exports = {
  isConfigured,
  normalizePhone,
  sendTemplate,
  sendWhatsAppStatus
};