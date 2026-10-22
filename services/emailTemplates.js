// ============================================
// EMAIL TEMPLATES + SENDER
// ============================================

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
const wrapHtml = ({ title, preheader, bodyHtml, ctaUrl, ctaText, footerNote }) => {
  const cta = ctaUrl && ctaText ? `
    <tr>
      <td align="center" style="padding: 24px 0;">
        <a href="${ctaUrl}" style="background:#B8935A; color:#fff; padding:14px 32px; text-decoration:none; border-radius:32px; font-weight:700; font-family:sans-serif; display:inline-block; letter-spacing:0.5px;">${ctaText}</a>
      </td>
    </tr>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#FAF7F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
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
              ${footerNote || 'Questions? Reply to this email or WhatsApp us — 24/7 support.<br>'}<br>
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
// HELPERS
// ============================================
const formatItems = (order) => {
  return order.items.map(item =>
    `<tr>
      <td style="padding:8px 0; border-bottom:1px solid #F0E8ED; color:#333;">${item.name}${item.size ? ` (${item.size})` : ''}</td>
      <td style="padding:8px 0; border-bottom:1px solid #F0E8ED; text-align:center; color:#666;">× ${item.quantity}</td>
      <td style="padding:8px 0; border-bottom:1px solid #F0E8ED; text-align:right; color:#B8935A; font-weight:600;">₹${item.price * item.quantity}</td>
    </tr>`
  ).join('');
};

const orderBox = (order) => `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2; border-radius:12px; margin:16px 0; padding:0;">
    <tr><td style="padding:16px 20px;">
      <div style="color:#888; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:4px;">Order</div>
      <div style="color:#0E0E0E; font-size:16px; font-weight:700; margin-bottom:12px;">#${order.orderId}</div>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${formatItems(order)}
        <tr>
          <td colspan="2" style="padding:12px 0 4px 0; color:#888; font-size:13px;">Total</td>
          <td style="padding:12px 0 4px 0; text-align:right; color:#0E0E0E; font-size:18px; font-weight:700;">₹${order.total}</td>
        </tr>
      </table>
    </td></tr>
  </table>
`;

const trackingBox = (order) => {
  if (!order.shiprocket?.awbCode && !order.tracking?.number) return '';
  const awb = order.shiprocket?.awbCode || order.tracking?.number;
  const courier = order.shiprocket?.courierName || order.tracking?.courierName || '';
  const url = `https://shiprocket.co/tracking/${awb}`;
  const etd = order.shiprocket?.etd ? new Date(order.shiprocket.etd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFF9ED; border:1px solid #F0E8D0; border-radius:12px; margin:16px 0;">
      <tr><td style="padding:16px 20px;">
        <div style="color:#B8935A; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">📦 Tracking</div>
        ${courier ? `<div style="color:#0E0E0E; font-size:14px; margin-bottom:4px;">Courier: <strong>${courier}</strong></div>` : ''}
        <div style="color:#0E0E0E; font-size:14px; margin-bottom:4px;">AWB: <strong style="font-family:monospace;">${awb}</strong></div>
        ${etd ? `<div style="color:#555; font-size:13px; margin-bottom:8px;">Expected delivery: <strong>${etd}</strong></div>` : ''}
        <a href="${url}" style="color:#B8935A; font-size:13px; font-weight:600; text-decoration:none;">Track your package →</a>
      </td></tr>
    </table>
  `;
};

// ============================================
// TEMPLATES BY TYPE
// ============================================
const templates = {
  // ────────────── ORDER CONFIRMED ──────────────
  order_confirmed: (order) => ({
    subject: `✅ Order Confirmed #${order.orderId} — LOOP`,
    title: 'Your order is confirmed!',
    preheader: `Thanks for shopping with LOOP. Order #${order.orderId} is confirmed.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Thank you for shopping with LOOP. We've received your payment and your order is confirmed. ✨</p>
      ${orderBox(order)}
      <p style="margin:0 0 12px 0;">We'll notify you as soon as your order ships.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order',
    footerNote: 'Questions? Reply to this email or WhatsApp us — 24/7 support.<br>'
  }),

  // ────────────── ORDER PROCESSING ──────────────
  order_processing: (order) => ({
    subject: `🔄 Order #${order.orderId} is being packed — LOOP`,
    title: 'We\'re preparing your order',
    preheader: `Order #${order.orderId} is being carefully packed.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Your order is being carefully packed by our team. You'll get another email from us the moment it ships. 📦</p>
      ${orderBox(order)}
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order'
  }),

  // ────────────── ORDER SHIPPED ──────────────
  order_shipped: (order) => ({
    subject: `🚚 Order #${order.orderId} has shipped! — LOOP`,
    title: 'Your order is on its way',
    preheader: `Order #${order.orderId} has been shipped. Track it now.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Great news — your order has been picked up by our courier and is on its way to you! 🎉</p>
      ${trackingBox(order)}
      ${orderBox(order)}
      <p style="margin:0 0 12px 0;">You can track your package anytime with the tracking number above.</p>
    `,
    ctaUrl: order.tracking?.url || `https://shiprocket.co/tracking/${order.shiprocket?.awbCode || order.tracking?.number}`,
    ctaText: 'Track Shipment'
  }),

  // ────────────── OUT FOR DELIVERY ──────────────
  order_out_for_delivery: (order) => ({
    subject: `📮 Order #${order.orderId} arriving today — LOOP`,
    title: 'Out for delivery — arriving today',
    preheader: `Your LOOP order arrives today. Keep your phone handy.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Your LOOP order is out for delivery today! 📮 Please keep your phone handy so the courier can reach you.</p>
      ${trackingBox(order)}
      <p style="margin:0 0 12px 0;">If you miss the delivery, our courier will attempt again. You can always reach our support on WhatsApp.</p>
    `,
    ctaUrl: order.tracking?.url,
    ctaText: 'Track Live'
  }),

  // ────────────── DELIVERED ──────────────
  order_delivered: (order) => ({
    subject: `✅ Order #${order.orderId} delivered! — LOOP`,
    title: 'Delivered! How was it?',
    preheader: `Your LOOP order has been delivered. Share your review!`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Your order has been delivered! We hope you love it. 🎉</p>
      ${orderBox(order)}
      <p style="margin:0 0 12px 0;">Help other customers by sharing your experience — a quick rating and review makes a big difference. ⭐</p>
      <p style="margin:0 0 12px 0; padding:12px 16px; background:#FAF7F2; border-radius:8px; font-size:13px; color:#666;">
        💬 Any issues with your order? Message us on WhatsApp anytime — we're here 24/7.
      </p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'Rate Your Order'
  }),

  // ────────────── NDR (Failed Delivery Attempt) ──────────────
  order_ndr: (order) => ({
    subject: `⚠️ Delivery attempt failed — Order #${order.orderId}`,
    title: 'We couldn\'t reach you',
    preheader: `Our courier attempted delivery but couldn't reach you.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Our courier attempted to deliver your order but couldn't reach you. 😔</p>
      ${trackingBox(order)}
      <p style="margin:0 0 12px 0; padding:12px 16px; background:#FFF5E6; border:1px solid #FFE4B5; border-radius:8px; font-size:13px; color:#B8935A;">
        ⏱️ Please respond within 48 hours so we can schedule a reattempt. Otherwise, the order will be returned to us.
      </p>
      <p style="margin:0 0 12px 0;">Need help? WhatsApp us — we'll sort it out together.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'Manage Delivery'
  }),

  // ────────────── CANCELLED ──────────────
  order_cancelled: (order) => ({
    subject: `Order #${order.orderId} cancelled — LOOP`,
    title: 'Order cancelled',
    preheader: `Your LOOP order has been cancelled.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Your order has been cancelled.</p>
      ${orderBox(order)}
      <p style="margin:0 0 12px 0;">If this was a mistake or you need help placing a new order, message us on WhatsApp — we'll help you out right away.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders`,
    ctaText: 'View Orders'
  }),

  // ────────────── RETURNED ──────────────
  order_returned: (order) => ({
    subject: `↩️ Return initiated for #${order.orderId} — LOOP`,
    title: 'Return in progress',
    preheader: `Return pickup scheduled for your LOOP order.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Your return pickup has been scheduled. Our courier will collect the items from your address.</p>
      ${trackingBox(order)}
      <p style="margin:0 0 12px 0;">For any questions about your return, message us on WhatsApp — 24/7.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/orders/${order.orderId}`,
    ctaText: 'View Order'
  }),

  // ────────────── WELCOME BONUS ──────────────
  welcome_bonus: (order) => ({
    subject: `🎉 Welcome to LOOP — ₹${order.welcomeAmount} bonus inside!`,
    title: 'Welcome to LOOP!',
    preheader: `You've received a welcome bonus. Start shopping now.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">Welcome to LOOP! We're so glad you're here. 🎉</p>
      <p style="margin:0 0 12px 0;">To get you started, we've credited <strong style="color:#B8935A; font-size:18px;">₹${order.welcomeAmount}</strong> to your wallet. Use it on any product — no minimum order!</p>
      <p style="margin:0 0 12px 0;">Happy shopping!</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}`,
    ctaText: 'Start Shopping'
  }),

  // ────────────── REFERRAL REWARD ──────────────
  referral_reward: (order) => ({
    subject: `🎉 You earned ₹${order.rewardAmount} referral reward!`,
    title: 'You earned a referral reward',
    preheader: `${order.friendName} completed their first order. ₹${order.rewardAmount} credited to your wallet.`,
    body: `
      <p style="margin:0 0 12px 0;">Hi ${order.customer?.name?.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 12px 0;">🎉 Great news! <strong>${order.friendName}</strong> completed their first LOOP order using your referral link.</p>
      <p style="margin:0 0 12px 0; padding:16px 20px; background:#FFF9ED; border:1px solid #F0E8D0; border-radius:12px; text-align:center;">
        <span style="color:#888; font-size:12px; letter-spacing:1px;">REWARD CREDITED</span><br>
        <span style="color:#B8935A; font-size:28px; font-weight:700;">₹${order.rewardAmount}</span><br>
        <span style="color:#666; font-size:12px;">to your LOOP wallet</span>
      </p>
      <p style="margin:0 0 12px 0;">Keep sharing — every successful referral earns you more.</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/profile`,
    ctaText: 'View Wallet'
  }),

  // ────────────── ADMIN: NEW ORDER ──────────────
  admin_new_order: (order) => ({
    subject: `🛍️ New Order #${order.orderId} — ₹${order.total}`,
    title: 'New order received',
    preheader: `New order #${order.orderId} from ${order.customer?.name}.`,
    body: `
      <p style="margin:0 0 12px 0;">A new order has been placed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F2; border-radius:12px; margin:16px 0;">
        <tr><td style="padding:16px 20px;">
          <div style="color:#888; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">Customer</div>
          <div style="color:#0E0E0E; font-size:14px; margin-bottom:4px;"><strong>${order.customer?.name || 'Guest'}</strong></div>
          <div style="color:#666; font-size:13px; margin-bottom:4px;">📧 ${order.customer?.email || 'N/A'}</div>
          <div style="color:#666; font-size:13px; margin-bottom:12px;">📱 ${order.customer?.phone || 'N/A'}</div>

          <div style="color:#888; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">Address</div>
          <div style="color:#666; font-size:13px; line-height:1.5; margin-bottom:12px;">
            ${order.customer?.address?.street || ''}<br>
            ${order.customer?.address?.city || ''}, ${order.customer?.address?.state || ''} — ${order.customer?.address?.pincode || ''}
          </div>

          <div style="color:#888; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">Items</div>
          ${order.items.map(i => `<div style="color:#333; font-size:13px; margin-bottom:2px;">${i.quantity} × ${i.name} ${i.size ? `(${i.size})` : ''} — ₹${i.price * i.quantity}</div>`).join('')}

          <div style="border-top:1px solid #E8E0E5; margin-top:12px; padding-top:12px; display:flex; justify-content:space-between;">
            <span style="color:#888; font-size:13px;">Total</span>
            <strong style="color:#B8935A; font-size:16px;">₹${order.total}</span>
          </div>
        </td></tr>
      </table>
      ${order.shiprocket?.awbCode ? `<p style="color:#28a745; font-size:13px;">✅ Shipment already created — AWB ${order.shiprocket.awbCode}</p>` : `<p style="color:#B8935A; font-size:13px; font-weight:600;">⚠️ Action needed — create shipment in admin</p>`}
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/admin`,
    ctaText: 'Open Admin'
  }),

  // ────────────── ADMIN: PAYMENT CONFIRMED ──────────────
  admin_payment_confirmed: (order) => ({
    subject: `💰 Payment received — Order #${order.orderId} · ₹${order.total}`,
    title: 'Payment confirmed',
    preheader: `Order #${order.orderId} is paid and ready to ship.`,
    body: `
      <p style="margin:0 0 12px 0;">Payment has been confirmed for order #${order.orderId}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E8F5E9; border:1px solid #C8E6C9; border-radius:12px; margin:16px 0;">
        <tr><td style="padding:16px 20px;">
          <div style="color:#2E7D32; font-size:11px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px;">✅ Paid</div>
          <div style="color:#0E0E0E; font-size:22px; font-weight:700; margin-bottom:4px;">₹${order.total}</div>
          <div style="color:#666; font-size:13px;">via ${order.paymentMethod === 'wallet' ? 'Wallet' : 'Razorpay'}</div>
          ${order.paymentDetails?.razorpay_payment_id ? `<div style="color:#666; font-size:12px; margin-top:8px; font-family:monospace;">TXN: ${order.paymentDetails.razorpay_payment_id}</div>` : ''}
        </td></tr>
      </table>
      <p style="color:#666; font-size:13px;">Customer: <strong>${order.customer?.name || 'Guest'}</strong> (${order.customer?.phone || 'N/A'})</p>
      <p style="color:#B8935A; font-size:13px; font-weight:600;">⚠️ Action needed — create shipment in admin</p>
    `,
    ctaUrl: `${process.env.FRONTEND_URL}/admin`,
    ctaText: 'Ship This Order'
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

  const { subject, title, preheader, body, ctaUrl, ctaText, footerNote } = template(order);
  const to = order.customer?.email;
  if (!to) {
    console.log('📧 No customer email — skipping');
    return null;
  }

  return sendEmail({
    to,
    subject,
    html: wrapHtml({ title, preheader, bodyHtml: body, ctaUrl, ctaText, footerNote })
  });
};

// ============================================
// SEND ADMIN EMAIL
// ============================================
const sendAdminEmail = async (order, emailType) => {
  const template = templates[emailType];
  if (!template) return null;

  const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
  if (!adminEmail) {
    console.log('📧 No admin email — skipping');
    return null;
  }

  const { subject, title, preheader, body, ctaUrl, ctaText, footerNote } = template(order);
  return sendEmail({
    to: adminEmail,
    subject,
    html: wrapHtml({ title, preheader, bodyHtml: body, ctaUrl, ctaText, footerNote })
  });
};

module.exports = {
  sendEmail,
  sendStatusEmail,
  sendAdminEmail,
  templates
};