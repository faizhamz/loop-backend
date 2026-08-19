const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Process and resize uploaded image
 * Generates 3 sizes: thumbnail, medium, large
 */
const processImage = async (file, productId) => {
  try {
    // Create directory for product images
    const uploadDir = path.join(__dirname, '../uploads', productId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const baseName = `${timestamp}-${productId}`;

    // Sizes to generate
    const sizes = [
      { name: 'thumbnail', width: 150, height: 150, fit: 'cover' },
      { name: 'medium', width: 500, height: 500, fit: 'contain' },
      { name: 'large', width: 1200, height: 1200, fit: 'contain' }
    ];

    const urls = {};

    for (const size of sizes) {
      const outputPath = path.join(uploadDir, `${baseName}-${size.name}.jpg`);
      
      await sharp(file.buffer)
        .resize(size.width, size.height, {
          fit: size.fit,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
      
      // Store relative URL
      urls[size.name] = `/uploads/${productId}/${baseName}-${size.name}.jpg`;
    }

    return urls;
  } catch (error) {
    console.error('Error processing image:', error);
    throw error;
  }
};

/**
 * Delete product images
 */
const deleteProductImages = async (productId) => {
  const uploadDir = path.join(__dirname, '../uploads', productId);
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
};

module.exports = {
  processImage,
  deleteProductImages
};