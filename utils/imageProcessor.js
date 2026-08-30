const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const processImage = async (file, productId) => {
  try {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    const baseFilename = `${productId}-${timestamp}`;
    
    // Create product folder
    const productDir = path.join(uploadDir, productId);
    if (!fs.existsSync(productDir)) {
      fs.mkdirSync(productDir, { recursive: true });
    }
    
    // Generate different sizes
    const sizes = [
      { width: 1200, suffix: 'large' },    // Full size
      { width: 800, suffix: 'medium' },     // Product card
      { width: 400, suffix: 'small' },      // Thumbnail
      { width: 200, suffix: 'tiny' }        // Mini thumbnail
    ];
    
    const urls = {};
    const baseUrl = `/uploads/${productId}/`;
    
    for (const size of sizes) {
      const filename = `${baseFilename}-${size.suffix}${ext}`;
      const filepath = path.join(productDir, filename);
      
      await sharp(file.buffer)
        .resize(size.width, null, {
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: 80, progressive: true })
        .toFile(filepath);
      
      urls[size.suffix] = `${baseUrl}${filename}`;
    }
    
    // Also save original
    const originalFilename = `${baseFilename}-original${ext}`;
    const originalPath = path.join(productDir, originalFilename);
    await sharp(file.buffer)
      .jpeg({ quality: 85 })
      .toFile(originalPath);
    urls.original = `${baseUrl}${originalFilename}`;
    
    return urls;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};

const deleteProductImages = async (productId) => {
  try {
    const productDir = path.join(uploadDir, productId);
    if (fs.existsSync(productDir)) {
      fs.rmSync(productDir, { recursive: true, force: true });
      console.log(`🗑️ Deleted images for product ${productId}`);
    }
  } catch (error) {
    console.error('Error deleting product images:', error);
  }
};

module.exports = {
  processImage,
  deleteProductImages
};