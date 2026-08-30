const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Generate shipping label PDF
const generateShippingLabel = async (labelData) => {
  try {
    const { order, label } = labelData;

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([288, 432]); // 4x6 inches at 72 DPI

    // Load fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // =============================================
    // ✅ FIND AND LOAD LOGO IMAGE
    // =============================================
    let logoImage = null;
    let logoPath = null;
    
    // Try ALL possible image extensions in ALL possible locations
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
    const folders = [
      '../public',
      '../assets',
      '../images',
      '../img',
      '../',
      '.',
      'public',
      'assets',
      'images',
      'img'
    ];
    
    for (const folder of folders) {
      for (const ext of extensions) {
        const imagePath = path.join(__dirname, folder, `logo.${ext}`);
        if (fs.existsSync(imagePath)) {
          try {
            const imageBytes = fs.readFileSync(imagePath);
            // Try PNG first
            if (ext === 'png') {
              try {
                logoImage = await pdfDoc.embedPng(imageBytes);
                logoPath = imagePath;
                break;
              } catch {}
            }
            // Try JPG
            if (!logoImage && (ext === 'jpg' || ext === 'jpeg')) {
              try {
                logoImage = await pdfDoc.embedJpg(imageBytes);
                logoPath = imagePath;
                break;
              } catch {}
            }
            if (logoImage) {
              logoPath = imagePath;
              break;
            }
          } catch (err) {
            // Silently skip failed attempts
          }
        }
      }
      if (logoImage) break;
    }

    if (logoImage) {
      console.log(`✅ Logo loaded from: ${logoPath}`);
    } else {
      console.warn('⚠️ No logo image found. Using text fallback.');
    }

    // =============================================
    // ✅ HELPER: Draw Text
    // =============================================
    const drawText = (text, x, y, size = 8, color = rgb(0, 0, 0), fontType = 'regular') => {
      // Replace special characters with safe ASCII
      const safeText = text
        .replace(/[^\x00-\x7F]/g, (char) => {
          if (char === '₹') return 'Rs.';
          if (char === '❤️') return '<3';
          if (char === '∞') return '∞';
          return '';
        });
      const f = fontType === 'bold' ? fontBold : font;
      page.drawText(safeText, {
        x,
        y,
        size,
        font: f,
        color: color,
      });
    };

    let y = 400; // Start from top

    // =============================================
    // ✅ LOGO - IMAGE OR TEXT FALLBACK
    // =============================================
    if (logoImage) {
      // Calculate dimensions (fit within 160px width, 50px height)
      const maxWidth = 160;
      const maxHeight = 50;
      let logoWidth = logoImage.width;
      let logoHeight = logoImage.height;
      
      // Scale to fit maxWidth
      if (logoWidth > maxWidth) {
        logoHeight = (logoHeight / logoWidth) * maxWidth;
        logoWidth = maxWidth;
      }
      // Scale to fit maxHeight
      if (logoHeight > maxHeight) {
        logoWidth = (logoWidth / logoHeight) * maxHeight;
        logoHeight = maxHeight;
      }
      
      const xPos = (288 - logoWidth) / 2; // Center horizontally
      const yPos = y - logoHeight + 5; // Top alignment
      
      page.drawImage(logoImage, {
        x: xPos,
        y: yPos,
        width: logoWidth,
        height: logoHeight,
      });
      
      console.log(`✅ Logo drawn: ${logoWidth}x${logoHeight}px`);
      y = y - logoHeight - 5;
    } else {
      // Fallback: Text logo
      drawText('LOOP', 15, y, 18, rgb(0.83, 0.69, 0.22), 'bold');
      y -= 10;
      drawText('Make your move', 15, y, 7, rgb(0.5, 0.5, 0.5));
      y -= 10;
    }

    // Divider line
    page.drawLine({
      start: { x: 15, y: y },
      end: { x: 273, y: y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 10;

    // =============================================
    // ✅ FROM SECTION
    // =============================================
    drawText('FROM', 15, y, 7, rgb(0.4, 0.4, 0.4), 'bold');
    y -= 10;
    drawText(label.from.name || 'LOOP Store', 15, y, 8);
    y -= 10;
    drawText(label.from.address || '', 15, y, 8);
    y -= 10;
    drawText(`${label.from.city || ''}, ${label.from.state || ''} - ${label.from.pincode || ''}`, 15, y, 8);
    y -= 10;
    drawText(`Phone: ${label.from.phone || ''}`, 15, y, 8);
    y -= 15;

    // =============================================
    // ✅ TO SECTION
    // =============================================
    drawText('TO', 15, y, 7, rgb(0.4, 0.4, 0.4), 'bold');
    y -= 10;
    drawText(label.to.name || 'Customer', 15, y, 8);
    y -= 10;
    drawText(label.to.address || '', 15, y, 8);
    y -= 10;
    drawText(`${label.to.city || ''}, ${label.to.state || ''} - ${label.to.pincode || ''}`, 15, y, 8);
    y -= 10;
    drawText(`Phone: ${label.to.phone || ''}`, 15, y, 8);
    y -= 15;

    // =============================================
    // ✅ ORDER DETAILS
    // =============================================
    drawText('ORDER DETAILS', 15, y, 7, rgb(0.4, 0.4, 0.4), 'bold');
    y -= 10;
    drawText(`Order: ${order.orderId}`, 15, y, 8);
    y -= 10;
    drawText(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 15, y, 8);
    y -= 10;
    drawText(`Items: ${order.items.length} items`, 15, y, 8);
    y -= 10;
    drawText(`Value: Rs.${order.total}`, 15, y, 8);
    y -= 15;

    // =============================================
    // ✅ ITEMS LIST
    // =============================================
    order.items.slice(0, 3).forEach((item, index) => {
      const sizeText = item.size ? ` (${item.size})` : '';
      let name = item.name.length > 30 ? item.name.substring(0, 27) + '...' : item.name;
      drawText(`${index + 1}. ${name}${sizeText} x ${item.quantity}`, 15, y, 7, rgb(0.3, 0.3, 0.3));
      y -= 12;
    });

    if (order.items.length > 3) {
      drawText(`+ ${order.items.length - 3} more items`, 15, y, 7, rgb(0.5, 0.5, 0.5));
      y -= 12;
    }
    y -= 5;

    // =============================================
    // ✅ TRACKING & COURIER
    // =============================================
    drawText(`Tracking: ${label.tracking.number}`, 15, y, 8, rgb(0.83, 0.69, 0.22), 'bold');
    y -= 12;
    drawText(`Courier: ${label.tracking.courierName || label.tracking.courier || 'Delhivery'}`, 15, y, 8);
    y -= 15;

    // =============================================
    // ✅ BARCODE (Simple text-based)
    // =============================================
    drawText(label.tracking.number, 15, y, 10, rgb(0, 0, 0), 'bold');
    y -= 12;

    // Barcode lines
    const chars = label.tracking.number.split('');
    let x = 15;
    chars.forEach((char, index) => {
      const width = (char.charCodeAt(0) % 3) + 1;
      const height = 10;
      const isDark = index % 2 === 0;
      page.drawRectangle({
        x: x,
        y: y,
        width: width,
        height: height,
        color: isDark ? rgb(0, 0, 0) : rgb(1, 1, 1),
      });
      x += width + 1;
    });
    y -= 15;

    // =============================================
    // ✅ INSTRUCTIONS
    // =============================================
    if (label.instructions) {
      drawText(`[!] ${label.instructions}`, 15, y, 7, rgb(1, 0.3, 0.3), 'bold');
      y -= 12;
    }

    // =============================================
    // ✅ FOOTER
    // =============================================
    y = 20;
    drawText(`Label: LBL-${order.orderId} | ${new Date().toLocaleString()}`, 15, y, 6, rgb(0.6, 0.6, 0.6));
    y -= 10;
    drawText('Thank you for choosing LOOP!', 15, y, 7, rgb(0.83, 0.69, 0.22));

    // =============================================
    // ✅ CUT LINE
    // =============================================
    y = 5;
    page.drawLine({
      start: { x: 15, y: y },
      end: { x: 273, y: y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    drawText('— Cut Here —', 15, y - 5, 5, rgb(0.7, 0.7, 0.7));

    // Save PDF
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);

  } catch (error) {
    console.error('❌ Label generation error:', error);
    throw error;
  }
};

// =============================================
// ✅ SAVE LABEL PDF
// =============================================
const saveLabelPDF = async (orderId, pdfBuffer) => {
  try {
    const labelsDir = path.join(__dirname, '../labels');
    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
      console.log('📁 Created labels directory:', labelsDir);
    }

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
    console.error('❌ Save label error:', error);
    throw error;
  }
};

// =============================================
// ✅ DELETE LABEL PDF
// =============================================
const deleteLabelPDF = async (orderId) => {
  try {
    const filename = `label-${orderId}.pdf`;
    const filepath = path.join(__dirname, '../labels', filename);

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
  deleteLabelPDF
};