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

    // Helper: draw text with string replacement for special characters
    const drawText = (text, x, y, size = 8, color = rgb(0, 0, 0), fontType = 'regular') => {
      // ✅ Replace special characters with ASCII equivalents
      let safeText = text
        .replace(/∞/g, '∞')  // Keep infinity symbol - Helvetica supports it
        .replace(/₹/g, '₹')  // Keep rupee symbol
        .replace(/[^\x00-\x7F]/g, (char) => {
          // Replace any other non-ASCII characters with a safe version
          if (char === '∞') return '∞';
          if (char === '₹') return '₹';
          if (char === '❤️') return '<3';
          if (char === '📮') return '[FROM]';
          if (char === '📦') return '[TO]';
          if (char === '📋') return '[ORDER]';
          if (char === '🚚') return '[COURIER]';
          if (char === '⚠️') return '[!]';
          if (char === '✅') return '[OK]';
          if (char === '⭐') return '[*]';
          if (char === '✨') return '[*]';
          return char.replace(/[^\x00-\x7F]/g, '');
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
    // ✅ LOGO - Use "LOOP" instead of infinity symbol
    // =============================================
    drawText('LOOP', 15, y, 18, rgb(0.83, 0.69, 0.22), 'bold');
    y -= 10;
    drawText('Make your move', 15, y, 7, rgb(0.5, 0.5, 0.5));
    y -= 10;
    page.drawLine({
      start: { x: 15, y: y },
      end: { x: 273, y: y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 10;

    // =============================================
    // ✅ FROM
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
    // ✅ TO
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
    // ✅ TRACKING
    // =============================================
    drawText(`Tracking: ${label.tracking.number}`, 15, y, 8, rgb(0.83, 0.69, 0.22), 'bold');
    y -= 12;
    drawText(`Courier: ${label.tracking.courierName || label.tracking.courier || 'Delhivery'}`, 15, y, 8);
    y -= 15;

    // =============================================
    // ✅ BARCODE (simple text)
    // =============================================
    drawText(label.tracking.number, 15, y, 10, rgb(0, 0, 0), 'bold');
    y -= 12;

    // Simple barcode lines
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

// Save label PDF
const saveLabelPDF = async (orderId, pdfBuffer) => {
  try {
    const labelsDir = path.join(__dirname, '../labels');
    if (!fs.existsSync(labelsDir)) {
      fs.mkdirSync(labelsDir, { recursive: true });
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

// Delete label PDF
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