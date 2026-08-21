// Email notification (using nodemailer)
const nodemailer = require('nodemailer');

// Simple notification system
class NotificationService {
  constructor() {
    // Configure email transporter
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Send email notification
  async sendEmail(to, subject, html) {
    try {
      const info = await this.transporter.sendMail({
        from: `"LOOP Store" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
      });
      console.log('Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Email error:', error);
      return null;
    }
  }

  // New order notification to admin
  async notifyNewOrder(order) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@loopstore.in';
    const subject = `🛍️ New Order #${order.orderId}`;
    const html = `
      <h2>New Order Received! 🎉</h2>
      <p><strong>Order ID:</strong> ${order.orderId}</p>
      <p><strong>Customer:</strong> ${order.customer?.name || 'Guest'}</p>
      <p><strong>Total:</strong> ₹${order.total}</p>
      <p><strong>Items:</strong> ${order.items?.length || 0} items</p>
      <p><a href="${process.env.ADMIN_URL}/orders">View Order</a></p>
    `;
    return this.sendEmail(adminEmail, subject, html);
  }

  // Payment confirmation notification
  async notifyPaymentReceived(order) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@loopstore.in';
    const subject = `✅ Payment Received for Order #${order.orderId}`;
    const html = `
      <h2>Payment Confirmed! 💰</h2>
      <p><strong>Order ID:</strong> ${order.orderId}</p>
      <p><strong>Amount:</strong> ₹${order.total}</p>
      <p><strong>Customer:</strong> ${order.customer?.name || 'Guest'}</p>
      <p><a href="${process.env.ADMIN_URL}/orders">View Order</a></p>
    `;
    return this.sendEmail(adminEmail, subject, html);
  }

  // Order shipped notification to customer
  async notifyCustomerShipped(order) {
    if (!order.customer?.email) return;
    const subject = `🚚 Your Order #${order.orderId} has been Shipped!`;
    const trackingInfo = order.tracking?.number ? `<p><strong>Tracking:</strong> ${order.tracking.number}</p>` : '';
    const html = `
      <h2>Your Order is on the Way! 🚚</h2>
      <p><strong>Order ID:</strong> ${order.orderId}</p>
      ${trackingInfo}
      <p><a href="${process.env.FRONTEND_URL}/orders">Track Your Order</a></p>
    `;
    return this.sendEmail(order.customer.email, subject, html);
  }

  // Order delivered notification to customer
  async notifyCustomerDelivered(order) {
    if (!order.customer?.email) return;
    const subject = `✅ Your Order #${order.orderId} has been Delivered!`;
    const html = `
      <h2>Order Delivered! 🎉</h2>
      <p><strong>Order ID:</strong> ${order.orderId}</p>
      <p>Thank you for shopping with LOOP! We hope you love your items.</p>
      <p><a href="${process.env.FRONTEND_URL}/orders">View Your Order</a></p>
    `;
    return this.sendEmail(order.customer.email, subject, html);
  }
}

module.exports = new NotificationService();