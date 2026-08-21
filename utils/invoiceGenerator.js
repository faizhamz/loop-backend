const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateInvoice = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header - Logo
      doc.fontSize(24)
         .fillColor('#D4AF37')
         .text('LOOP', { align: 'center' })
         .fontSize(14)
         .fillColor('#888')
         .text('Make your move', { align: 'center' })
         .moveDown();

      // Invoice Title
      doc.fontSize(20)
         .fillColor('#000')
         .text('INVOICE', { align: 'center' })
         .moveDown();

      // Order Details
      doc.fontSize(12)
         .fillColor('#333');
      
      doc.text(`Order ID: ${order.orderId}`, { continued: true })
         .text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });

      doc.moveDown();

      // Customer Details
      doc.fontSize(14)
         .fillColor('#D4AF37')
         .text('Customer Details')
         .fontSize(12)
         .fillColor('#333');
      
      doc.text(`Name: ${order.customer?.name || 'Guest'}`);
      doc.text(`Email: ${order.customer?.email || 'N/A'}`);
      doc.text(`Phone: ${order.customer?.phone || 'N/A'}`);
      doc.moveDown();

      // Shipping Address
      doc.fontSize(14)
         .fillColor('#D4AF37')
         .text('Shipping Address')
         .fontSize(12)
         .fillColor('#333');
      
      const addr = order.customer?.address;
      if (addr) {
        doc.text(`${addr.street || ''}`);
        doc.text(`${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`);
        if (addr.landmark) doc.text(`Landmark: ${addr.landmark}`);
      }
      doc.moveDown();

      // Items Table
      doc.fontSize(14)
         .fillColor('#D4AF37')
         .text('Items Ordered')
         .fontSize(12)
         .fillColor('#333');

      // Table Header
      const tableTop = doc.y;
      doc.text('Item', 50, tableTop, { width: 200 });
      doc.text('Qty', 300, tableTop, { width: 50, align: 'center' });
      doc.text('Price', 400, tableTop, { width: 80, align: 'right' });
      doc.text('Total', 500, tableTop, { width: 80, align: 'right' });

      doc.moveDown();

      // Table Rows
      order.items.forEach((item) => {
        const y = doc.y;
        doc.text(item.name, 50, y, { width: 200 });
        doc.text(String(item.quantity), 300, y, { width: 50, align: 'center' });
        doc.text(`₹${item.price}`, 400, y, { width: 80, align: 'right' });
        doc.text(`₹${item.price * item.quantity}`, 500, y, { width: 80, align: 'right' });
        doc.moveDown();
      });

      doc.moveDown();

      // Totals
      const totalY = doc.y;
      doc.text(`Subtotal: ₹${order.subtotal}`, 400, totalY, { align: 'right' });
      doc.text(`Shipping: ₹${order.shipping || 0}`, 400, doc.y + 20, { align: 'right' });
      if (order.discount > 0) {
        doc.text(`Discount: -₹${order.discount}`, 400, doc.y + 20, { align: 'right' });
      }
      doc.fontSize(16)
         .fillColor('#D4AF37')
         .text(`Total: ₹${order.total}`, 400, doc.y + 20, { align: 'right' });

      doc.moveDown(2);

      // Footer
      doc.fontSize(10)
         .fillColor('#888')
         .text('Thank you for shopping with LOOP!', { align: 'center' })
         .text('For support: support@loopstore.in | +91 98765 43210', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = generateInvoice;