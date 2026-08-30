const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas } = require('canvas');

// Ensure labels directory exists
const labelsDir = path.join(__dirname, '../labels');
if (!fs.existsSync(labelsDir)) {
  fs.mkdirSync(labelsDir, { recursive: true });
}

// Generate barcode (simplified - using simple text barcode)
const generateBarcode = (text) => {
  // In production, use a proper barcode library like 'bwip-js' or 'jsbarcode'
  // For now, return a formatted text that looks like a barcode
  const chars = text.split('');
  return chars.map(c => {
    const code = c.charCodeAt(0);
    return '█'.repeat(code % 5 + 1) + ' '.repeat(3 - (code % 3));
  }).join('');
};

// Generate QR Code as base64
const generateQRCode = async (data) => {
  try {
    const qrData = typeof data === 'object' ? JSON.stringify(data) : data;
    return await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 150,
      height: 150,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
  } catch (error) {
    console.error('QR Code generation error:', error);
    return null;
  }
};

// Main label generation function
const generateShippingLabel = async (labelData) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { order, label } = labelData;
      
      // Generate tracking QR code
      const trackingUrl = process.env.FRONTEND_URL || 'https://loopstore.in';
      const qrData = {
        orderId: order.orderId,
        tracking: label.tracking.number,
        courier: label.tracking.courier,
        url: `${trackingUrl}/track/${label.tracking.number}`
      };
      const qrCodeBase64 = await generateQRCode(qrData);
      
      // Create PDF
      const doc = new PDFDocument({
        size: [288, 432], // 4x6 inches at 72 DPI
        margin: 15,
        autoFirstPage: true
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      
      // =============================================
      // LABEL CONTENT
      // =============================================
      
      // Border
      doc.rect(5, 5, 278, 422).stroke('#ccc');
      
      // Header - Store Name
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#D4AF37')
         .text('LOOP', 15, 20, { align: 'center' })
         .fontSize(8)
         .fillColor('#888')
         .text('Make your move', { align: 'center' });
      
      // Divider
      doc.moveTo(15, 42)
         .lineTo(273, 42)
         .stroke('#ddd');
      
      // =============================================
      // FROM SECTION
      // =============================================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📮 FROM', 15, 50);
      
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#000')
         .text(label.from.name, 15, 60)
         .text(label.from.address, 15, 70)
         .text(`${label.from.city}, ${label.from.state} - ${label.from.pincode}`, 15, 80)
         .text(`📞 ${label.from.phone}`, 15, 90);
      
      // =============================================
      // TO SECTION
      // =============================================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📦 TO', 15, 110);
      
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#000')
         .text(label.to.name, 15, 120)
         .text(label.to.address, 15, 130)
         .text(`${label.to.city}, ${label.to.state} - ${label.to.pincode}`, 15, 140)
         .text(`📞 ${label.to.phone}`, 15, 150);
      
      // =============================================
      // ORDER DETAILS
      // =============================================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#666')
         .text('📋 ORDER DETAILS', 15, 170);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(`Order: ${order.orderId}`, 15, 180)
         .text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 15, 190)
         .text(`Items: ${order.items.length} item${order.items.length > 1 ? 's' : ''}`, 15, 200)
         .text(`Value: ₹${order.total}`, 15, 210);
      
      // =============================================
      // ITEMS LIST (Compact)
      // =============================================
      if (order.items.length <= 3) {
        doc.fontSize(7)
           .font('Helvetica')
           .fillColor('#555');
        
        order.items.slice(0, 3).forEach((item, index) => {
          const y = 220 + (index * 12);
          doc.text(`${index + 1}. ${item.name} (${item.size || 'M'}) × ${item.quantity}`, 15, y);
        });
      } else {
        doc.text(`${order.items.length} items (see order details)`, 15, 220);
      }
      
      // =============================================
      // TRACKING & COURIER
      // =============================================
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#D4AF37')
         .text(`📦 Tracking: ${label.tracking.number}`, 15, 265);
      
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#000')
         .text(`🚚 Courier: ${label.tracking.courierName || label.tracking.courier}`, 15, 275);
      
      // =============================================
      // QR CODE
      // =============================================
      if (qrCodeBase64) {
        try {
          const qrImage = qrCodeBase64.replace(/^data:image\/png;base64,/, '');
          const qrBuffer = Buffer.from(qrImage, 'base64');
          
          // Position QR code on the right side
          const qrX = 190;
          const qrY = 170;
          const qrSize = 75;
          
          doc.image(qrBuffer, qrX, qrY, {
            width: qrSize,
            height: qrSize
          });
          
          doc.fontSize(6)
             .font('Helvetica')
             .fillColor('#888')
             .text('Scan to track', qrX, qrY + qrSize + 2, {
               width: qrSize,
               align: 'center'
             });
        } catch (qrError) {
          console.error('QR rendering error:', qrError);
        }
      }
      
      // =============================================
      // BARCODE (Text-based)
      // =============================================
      const barcodeText = label.tracking.number;
      doc.fontSize(10)
         .font('Courier-Bold')
         .fillColor('#000')
         .text(barcodeText, 15, 295, {
           width: 258,
           align: 'center'
         });
      
      // Simple barcode visual
      const barcodeChars = barcodeText.split('');
      let barcodeX = 15;
      barcodeChars.forEach((char, index) => {
        const width = (char.charCodeAt(0) % 3) + 1;
        const height = 8;
        const y = 305;
        doc.rect(barcodeX, y, width, height)
           .fill(index % 2 === 0 ? '#000' : '#fff');
        barcodeX += width + 1;
      });
      
      // =============================================
      // INSTRUCTIONS / SPECIAL HANDLING
      // =============================================
      if (label.instructions) {
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('#ff4444')
           .text(`⚠️ ${label.instructions}`, 15, 325);
      }
      
      // =============================================
      // FOOTER
      // =============================================
      doc.fontSize(6)
         .font('Helvetica')
         .fillColor('#aaa')
         .text(`Label: LBL-${order.orderId}  |  Printed: ${new Date().toLocaleString()}`, 15, 395, {
           width: 258,
           align: 'center'
         });
      
      doc.text('Thank you for choosing LOOP! ❤️', 15, 408, {
        width: 258,
        align: 'center'
      });
      
      // =============================================
      // CUT LINE
      // =============================================
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
      console.error('Label generation error:', error);
      reject(error);
    }
  });
};

// Save label PDF to file
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

// Delete old labels (cleanup)
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
  labelsDir,
  generateQRCode,
  generateBarcode
};