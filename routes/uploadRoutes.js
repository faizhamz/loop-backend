const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processImage, deleteProductImages } = require('../utils/imageProcessor');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configured');
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/ogg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, WebP, GIF, and MP4 videos are allowed.'));
    }
  }
});

// ============================================
// HELPER: Upload to Cloudinary
// ============================================
const uploadToCloudinary = (file, folder = 'loop') => {
  return new Promise((resolve, reject) => {
    const isVideo = file.mimetype.startsWith('video/');
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: isVideo ? 'video' : 'image',
        transformation: isVideo ? [
          { quality: 'auto:best' }
        ] : [
          { width: 1200, height: 1200, crop: 'limit', quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
};

// ============================================
// SINGLE IMAGE UPLOAD
// ============================================
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { productId, folder = 'loop/products' } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    let urls;
    
    // Try Cloudinary first, fallback to local
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await uploadToCloudinary(req.file, folder);
        urls = {
          original: result.secure_url,
          thumbnail: result.secure_url,
          medium: result.secure_url
        };
        console.log('✅ Uploaded to Cloudinary:', result.secure_url);
      } catch (cloudErr) {
        console.error('Cloudinary upload failed, falling back to local:', cloudErr.message);
        urls = await processImage(req.file, productId);
      }
    } else {
      urls = await processImage(req.file, productId);
    }
    
    res.json({
      success: true,
      urls: urls,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MULTIPLE IMAGES UPLOAD
// ============================================
router.post('/images', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    const { productId, folder = 'loop/products' } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const results = [];
    for (const file of req.files) {
      let urls;
      
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          const result = await uploadToCloudinary(file, folder);
          urls = {
            original: result.secure_url,
            thumbnail: result.secure_url,
            medium: result.secure_url
          };
        } catch (cloudErr) {
          console.error('Cloudinary upload failed:', cloudErr.message);
          urls = await processImage(file, productId);
        }
      } else {
        urls = await processImage(file, productId);
      }
      
      results.push({
        originalName: file.originalname,
        urls: urls
      });
    }

    res.json({
      success: true,
      images: results
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// VIDEO UPLOAD
// ============================================
router.post('/video', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { productId, folder = 'loop/videos' } = req.body;
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    let videoUrl;
    
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        const result = await uploadToCloudinary(req.file, folder);
        videoUrl = result.secure_url;
        console.log('✅ Video uploaded to Cloudinary:', videoUrl);
      } catch (cloudErr) {
        console.error('Cloudinary video upload failed:', cloudErr.message);
        // Fallback: return base64 or error
        return res.status(500).json({ error: 'Video upload failed. Please try again.' });
      }
    } else {
      return res.status(400).json({ error: 'Cloudinary is required for video uploads' });
    }
    
    res.json({
      success: true,
      url: videoUrl,
      originalName: req.file.originalname
    });
  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE PRODUCT IMAGES
// ============================================
router.delete('/product/:productId', async (req, res) => {
  try {
    await deleteProductImages(req.params.productId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;