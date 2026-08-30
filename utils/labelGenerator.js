const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Ensure labels directory exists
const labelsDir = path.join(__dirname, '../labels');
if (!fs.existsSync(labelsDir)) {
  fs.mkdirSync(labelsDir, { recursive: true });
}

// Generate shipping label PDF
const generateShippingLabel = async (labelData) => {
  return new Promise((resolve, reject) => {
    try {
      const { order, label } = labelData;
      
      const doc = new PDFDocument({
        size: [288, 432],
        margin: 15,
        info: {
          Title: `Shipping Label ${order.orderId}`,
          Author: 'LOOP Store'
        }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // =============================================
      // ✅ HEADER WITH LOGO
      // =============================================
      
      // Store logo path - you can place your logo in backend/public/logo.png
      // For now, using a styled text logo with infinity symbol
      
      // Main Logo
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#D4AF37')
         .text('L', 15, 12, { continued: true });
      
      doc.fontSize(18)
         .font('Helvetica')
         .fillColor('#D4AF37')
         .text('∞', { continued: true });
      
      doc.fontSize(18)
         .font('Helvetica-Bold')
         .fillColor('#D4AF37')
         .text('P');
      
      // Tagline
      doc.fontSize(7)
         .font('Helvetica')
         .fillColor('#888')
         .text('Make your move', 15, 34, { align: 'center' });
      
      // Divider
      doc.moveTo(15, 42)
         .lineTo(273, 42)
         .stroke('#ddd');
      
      // =============================================
      // ✅ FROM SECTION (Store Address)
      // =============================================
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📮 FROM', 15, 52);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(label.from.name, 15, 62)
         .text(label.from.address, 15, 72)
         .text(`${label.from.city}, ${label.from.state} - ${label.from.pincode}`, 15, 82)
         .text(`📞 ${label.from.phone}`, 15, 92);
      
      // =============================================
      // ✅ TO SECTION (Customer)
      // =============================================
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📦 TO', 15, 112);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(label.to.name, 15, 122)
         .text(label.to.address, 15, 132)
         .text(`${label.to.city}, ${label.to.state} - ${label.to.pincode}`, 15, 142)
         .text(`📞 ${label.to.phone}`, 15, 152);
      
      // =============================================
      // ✅ ORDER DETAILS (with ₹ symbol)
      // =============================================
      doc.fontSize(7)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📋 ORDER DETAILS', 15, 172);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(`Order: ${order.orderId}`, 15, 182)
         .text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 15, 192)
         .text(`Items: ${order.items.length} item${order.items.length > 1 ? 's' : ''}`, 15, 202)
         .text(`Value: ₹${order.total}`, 15, 212);  // ✅ KEPT WITH ₹ SIGN
      
      // =============================================
      // ✅ ITEMS LIST
      // =============================================
      doc.fontSize(7)
         .font('Helvetica')
         .fillColor('#555');
      
      let itemY = 224;
      order.items.slice(0, 3).forEach((item, index) => {
        const sizeText = item.size ? ` (${item.size})` : '';
        doc.text(`${index + 1}. ${item.name}${sizeText} × ${item.quantity}`, 15, itemY);
        itemY += 12;
      });
      
      if (order.items.length > 3) {
        doc.text(`+ ${order.items.length - 3} more items`, 15, itemY);
        itemY += 12;
      }
      
      // =============================================
      // ✅ TRACKING & COURIER
      // =============================================
      const trackingY = Math.max(itemY + 4, 240);
      
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#D4AF37')
         .text(`📦 Tracking: ${label.tracking.number}`, 15, trackingY);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(`🚚 Courier: ${label.tracking.courierName || label.tracking.courier}`, 15, trackingY + 12);
      
      // =============================================
      // ✅ BARCODE
      // =============================================
      const barcodeY = trackingY + 28;
      const barcodeText = label.tracking.number;
      
      doc.fontSize(9)
         .font('Courier-Bold')
         .fillColor('#000')
         .text(barcodeText, 15, barcodeY, {
           width: 258,
           align: 'center'
         });
      
      // Simple barcode lines
      const barcodeChars = barcodeText.split('');
      let barcodeX = 15;
      const barcodeLineY = barcodeY + 12;
      
      barcodeChars.forEach((char, index) => {
        const width = (char.charCodeAt(0) % 3) + 1;
        const height = 8;
        doc.rect(barcodeX, barcodeLineY, width, height)
           .fill(index % 2 === 0 ? '#000' : '#fff');
        barcodeX += width + 1;
      });
      
      // =============================================
      // ✅ INSTRUCTIONS
      // =============================================
      if (label.instructions) {
        doc.fontSize(7)
           .font('Helvetica-Bold')
           .fillColor('#ff4444')
           .text(`⚠️ ${label.instructions}`, 15, barcodeLineY + 16);
      }
      
      // =============================================
      // ✅ FOOTER
      // =============================================
      const footerY = 395;
      doc.fontSize(6)
         .font('Helvetica')
         .fillColor('#aaa')
         .text(`Label: LBL-${order.orderId}  |  ${new Date().toLocaleString()}`, 15, footerY, {
           width: 258,
           align: 'center'
         });
      
      doc.fontSize(7)
         .fillColor('#D4AF37')
         .text('❤️ Thank you for choosing LOOP!', 15, 408, {
           width: 258,
           align: 'center'
         });
      
      // Cut line
      doc.moveTo(15, 420)
         .lineTo(273, 420)
         .stroke('#ddd');
      
      doc.fontSize(5)
         .fillColor('#ccc')
         .text('— Cut Here —', 15, 422, {
           width: 258,
           align: 'center'
         });
      
      doc.end();
      
    } catch (error) {
      console.error('PDF generation error:', error);
      reject(error);
    }
  });
};

// Save label PDF
const saveLabelPDF = async (orderId, pdfBuffer) => {
  try {
    const filename = `label-${orderId}.pdf`;
    const filepath = path.join(labelsDir, filename);
    
    fs.writeFileSync(filepath, pdfBuffer);
    console.log(`✅ Label saved: ${filepath}`);
    
    return {
      filename,
      filepath,
      url: `/api/labels/download/${filename}`
    };
  } catch (error) {
    console.error('Save label error:', error);
    throw error;
  }
};

// Delete label PDF
const deleteLabelPDF = async (orderId) => {
  try {
    const filename = `label-${orderId}.pdf`;
    const filepath = path.join(labelsDir, filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`🗑️ Deleted label: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Delete label error:', error);
    return false;
  }
};

module.exports = {
  generateShippingLabel,
  saveLabelPDF,
  deleteLabelPDF,
  labelsDir
};