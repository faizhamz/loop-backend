// ============================================
// EMAIL TEMPLATES + SENDER
// ============================================
// Builds branded HTML emails and sends via
// the shared Nodemailer transporter.

const nodemailer = require('nodemailer');

let transporter = null;

const initTransporter = () => {
  if (transporter) return transporter;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Email not configured (EMAIL_USER / EMAIL_PASS missing)');
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✅ Email transporter ready');
    return transporter;
  } catch (e) {
    console.error('Email init error:', e.message);
    return null;
  }
};

// ============================================
// BRANDED HTML WRAPPER
// ============================================
const wrapHtml = (title, bodyHtml, ctaUrl = null, ctaText = null) => {
  const cta = ctaUrl && ctaText ? `
    <tr>
      <td align="center" style="padding: 24px 0;">
        <a href="${ctaUrl}" style="background:#B8935A; color:#fff; padding:14px 32px; text-decoration:none; border-radius:32px; font-weight:700; font-family:sans-serif; display:inline-block; letter-spacing:0.5px;">${ctaText}</a>
      </td>
    </tr>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0; padding:0; background:#FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2; padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:32px 24px 16px 24px; background:#0E0E0E;">
              <div style="font-family: Georgia, serif; font-size:32px; color:#ffffff; letter-spacing:2px;">
                L<span style="color:#B8935A;">∞</span>P
              </div>
              <div style="color:#B8935A; font-size:11px; letter-spacing:4px; margin-top:4px;">MAKE YOUR MOVE</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 16px 0; color:#0E0E0E; font-size:22px; font-family: Georgia, serif;">${title}</h1>
              <div style="color:#555; font-size:15px; line-height:1.6; font-family: sans-serif;">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          ${cta}
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px; border-top:1px solid #F0E8ED; color:#999; font-size:12px; text-align:center; font-family: sans-serif;">
              Questions? Reply to this email or WhatsApp us.<br>
              © ${new Date().getFullYear()} LOOP · Make Your Move
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ============================================
// SEND EMAIL
// ============================================
const sendEmail = async ({ to, subject, html }) => {
  const t = initTransporter();
  if (!t) {
    console.log(`📧 [SKIPPED - no config] To: ${to} | Subject: ${subject}`);
    return { skipped: true };
  }
  try {
    const info = await t.sendMail({
      from: `"LOOP Store" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('📧 Email sent:', info.messageId);
    return info;
  } catch (err) {
    console.error('📧 Email error:', err.message);
    return null;
  }
};

// ============================================
// TEMPLATES BY TYPE
// ============================================
const templates = {
  order_confirmed: (order) => ({
    subject: `✅ Order Confirmed #${order.orderId}`,
    title: 'Your order is confirmed!',
    body: `
      <p>Hi ${order.customer?.name || 'there'},</p>
      <p>Thanks for shopping with LOOP. We've received your order and payment.</p>
      <p style="padding:16px; background:#FAF7F2; border-radius:12px; margin:16px 0;">
        <strong>Order:</strong> #${order.orderId}<br>
        <strong>Total:</strong> ₹${order.total}<br>
        <strong>Items:</strong> ${order.items?.length || 0}
      </p>
      <p>We'll notify you when it ships.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order'
  }),

  order_processing: (order) => ({
    subject: `📦 Order #${order.orderId} is being packed`,
    title: 'We\'re preparing your order',
    body: `<p>Your order is being carefully packed. You'll get another email when it ships.</p>`,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order'
  }),

  order_shipped: (order) => ({
    subject: `🚚 Order #${order.orderId} has shipped!`,
    title: 'Your order is on its way',
    body: `
      <p>Your order has been shipped via <strong>${order.shiprocket?.courierName || order.tracking?.courierName || 'our courier'}</strong>.</p>
      <p style="padding:16px; background:#FAF7F2; border-radius:12px; margin:16px 0;">
        <strong>Tracking #:</strong> ${order.shiprocket?.awbCode || order.tracking?.number}<br>
        ${order.shiprocket?.etd ? `<strong>Expected delivery:</strong> ${new Date(order.shiprocket.etd).toLocaleDateString('en-IN')}` : ''}
      </p>
    `,
    ctaUrl: order.tracking?.url || `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'Track Shipment'
  }),

  order_out_for_delivery: (order) => ({
    subject: `📮 Order #${order.orderId} arriving today`,
    title: 'Out for delivery',
    body: `<p>Your LOOP order is out for delivery today. Please keep your phone handy to receive it.</p>`,
    ctaUrl: order.tracking?.url,
    ctaText: 'Track Live'
  }),

  order_delivered: (order) => ({
    subject: `✅ Order #${order.orderId} delivered!`,
    title: 'Delivered! How was it?',
    body: `
      <p>Your order has been delivered. We hope you love it!</p>
      <p>Help other customers by leaving a review.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'Leave a Review'
  }),

  order_ndr: (order) => ({
    subject: `⚠️ Delivery attempt failed - Order #${order.orderId}`,
    title: 'We couldn\'t reach you',
    body: `
      <p>Our courier attempted to deliver your order but couldn't reach you.</p>
      <p>Please respond within 48 hours so we can schedule a reattempt. Otherwise the order will be returned.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'Manage Delivery'
  }),

  order_cancelled: (order) => ({
    subject: `Order #${order.orderId} cancelled`,
    title: 'Order cancelled',
    body: `<p>Your order has been cancelled. Any payment will be refunded within 3-5 business days.</p>`,
    ctaUrl: `${process.env.FRONTEND_URL}/orders`,
    ctaText: 'View Orders'
  }),

  order_returned: (order) => ({
    subject: `↩️ Return initiated for #${order.orderId}`,
    title: 'Return in progress',
    body: `
      <p>Your return pickup has been scheduled. Once we receive the items, we'll process your refund.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order'
  })
};

// ============================================
// SEND STATUS EMAIL BY TYPE
// ============================================
const sendStatusEmail = async (order, emailType) => {
  const template = templates[emailType];
  if (!template) {
    console.log(`📧 No template for ${emailType}`);
    return null;
  }

  const { subject, title, body, ctaUrl, ctaText } = template(order);
  const to = order.customer?.email;
  if (!to) {
    console.log('📧 No customer email — skipping');
    return null;
  }

  return sendEmail({
    to,
    subject,
    html: wrapHtml(title, body, ctaUrl, ctaText)
  });
};

module.exports = {
  sendEmail,
  sendStatusEmail,
  templates
};