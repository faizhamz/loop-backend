const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const handlebars = require('handlebars');

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
    path.join(__dirname, '../public/logo.jpg'),
    path.join(__dirname, '../public/logo.jpeg'),
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../assets/logo.png')
  ];

  for (const logoPath of possiblePaths) {
    if (fs.existsSync(logoPath)) {
      try {
        const logoBuffer = fs.readFileSync(logoPath);
        const ext = path.extname(logoPath).substring(1);
        const mimeType = ext === 'png' ? 'image/png' : 
                        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                        'image/png';
        console.log(`✅ Logo found at: ${logoPath}`);
        return `data:${mimeType};base64,${logoBuffer.toString('base64')}`;
      } catch (err) {
        console.log(`⚠️ Could not read logo at ${logoPath}:`, err.message);
      }
    }
  }
  
  console.log('⚠️ No logo image found, using text logo fallback');
  return null;
};

// Find Chrome executable path
const getChromePath = () => {
  // Check environment variables first
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  // Common paths for different environments
  const possiblePaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/chrome',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chrome',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  
  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✅ Chrome found at: ${chromePath}`);
      return chromePath;
    }
  }
  
  console.log('⚠️ Chrome not found in common paths');
  return null;
};

// Generate shipping label PDF
const generateShippingLabel = async (labelData) => {
  try {
    const { order, label } = labelData;

    if (!compiledTemplate) {
      throw new Error('Template not loaded. Please check labelTemplate.html exists.');
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
      date: new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }),
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

    // Find Chrome path
    const chromePath = getChromePath();
    
    if (!chromePath) {
      console.warn('⚠️ Chrome not found, trying to launch without executablePath');
    }

    // Launch browser with puppeteer-core
    const launchOptions = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-accelerated-2d-canvas',
        '--disable-pdf-viewer',
        '--disable-webgl',
        '--disable-software-rasterizer',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    };

    // Only add executablePath if we found Chrome
    if (chromePath) {
      launchOptions.executablePath = chromePath;
    }

    const browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();

    // Set viewport to label size (4x6 inches at 72 DPI = 288x432)
    await page.setViewport({
      width: 288,
      height: 432,
      deviceScaleFactor: 2
    });

    // Load HTML
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Wait for images to load
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).every(img => img.complete);
    }, { timeout: 5000 }).catch(() => {
      console.log('⚠️ Image loading timeout, continuing...');
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