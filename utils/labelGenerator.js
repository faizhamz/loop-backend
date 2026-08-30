const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer'); // ✅ Full puppeteer

// Register handlebars helpers
handlebars.registerHelper('inc', function(value) {
  return parseInt(value) + 1;
});

handlebars.registerHelper('now', function() {
  return new Date().toLocaleString();
});

handlebars.registerHelper('formatDate', function(date) {
  return new Date(date).toLocaleDateString('en-IN');
});

// Read and compile template
const templatePath = path.join(__dirname, 'labelTemplate.html');
let compiledTemplate = null;

try {
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  compiledTemplate = handlebars.compile(templateHtml);
  console.log('✅ Label template loaded successfully');
} catch (err) {
  console.error('❌ Failed to load label template:', err.message);
}

// Generate barcode lines
const generateBarcodeLines = (text) => {
  const chars = text.split('');
  return chars.map((char) => ({
    dark: char.charCodeAt(0) % 2 === 0,
    width: (char.charCodeAt(0) % 3) + 1
  }));
};

// Convert image to base64
const getLogoBase64 = () => {
  const possiblePaths = [
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../logo.png'),
  ];

  for (const logoPath of possiblePaths) {
    if (fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      } catch (err) {
        console.log(`⚠️ Could not read logo: ${err.message}`);
      }
    }
  }
  
  console.log('⚠️ No logo found, using text fallback');
  return null;
};

// Generate shipping label PDF
const generateShippingLabel = async (labelData) => {
  try {
    const { order, label } = labelData;

    if (!compiledTemplate) {
      throw new Error('Template not loaded');
    }

    // Truncate long item names
    const items = order.items.slice(0, 4).map(item => ({
      name: item.name.length > 35 ? item.name.substring(0, 32) + '...' : item.name,
      quantity: item.quantity,
      size: item.size || '',
      price: item.price
    }));

    // Prepare data for template
    const data = {
      logoBase64: getLogoBase64(),
      from: {
        name: label.from.name || 'LOOP Store',
        address: label.from.address || '123 Fashion Street',
        city: label.from.city || 'Mumbai',
        state: label.from.state || 'Maharashtra',
        pincode: label.from.pincode || '400001',
        phone: label.from.phone || '+91 98765 43210'
      },
      to: {
        name: label.to.name || 'Customer',
        address: label.to.address || 'N/A',
        city: label.to.city || 'N/A',
        state: label.to.state || 'N/A',
        pincode: label.to.pincode || 'N/A',
        phone: label.to.phone || 'N/A'
      },
      orderId: order.orderId,
      date: new Date(order.createdAt).toLocaleDateString('en-IN'),
      itemsCount: order.items.length,
      total: order.total || 0,
      items: items,
      moreItems: order.items.length > 4 ? order.items.length - 4 : 0,
      tracking: label.tracking.number,
      courier: label.tracking.courierName || label.tracking.courier || 'Delhivery',
      instructions: label.instructions || '',
      barcodeLines: generateBarcodeLines(label.tracking.number || 'LOOP000000')
    };

    // Generate HTML
    const html = compiledTemplate(data);

    // ✅ SIMPLE - Puppeteer handles everything
    console.log('🚀 Launching browser...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    console.log('✅ Browser launched');

    const page = await browser.newPage();

    await page.setViewport({
      width: 288,
      height: 432,
      deviceScaleFactor: 2
    });

    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Wait for images
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).every(img => img.complete);
    }, { timeout: 5000 }).catch(() => {
      console.log('⚠️ Image loading timeout');
    });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      width: '288px',
      height: '432px',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }
    });

    await browser.close();
    console.log('✅ PDF generated, size:', pdfBuffer.length);

    return pdfBuffer;

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