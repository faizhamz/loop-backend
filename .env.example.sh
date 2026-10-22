# ============================================
# SERVER
# ============================================
PORT=5002
NODE_ENV=production
FRONTEND_URL=https://loopstore.in
ADMIN_URL=https://loopstore.in/admin

# ============================================
# DATABASE
# ============================================
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/loop

# ============================================
# AUTH
# ============================================
JWT_SECRET=your-super-secret-jwt-key-change-this

# ============================================
# RAZORPAY (payments + refunds)
# ============================================
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx

# ============================================
# CLOUDINARY (image/video hosting)
# ============================================
CLOUDINARY_CLOUD_NAME=xxxxxxxxxx
CLOUDINARY_API_KEY=xxxxxxxxxxxxx
CLOUDINARY_API_SECRET=xxxxxxxxxxxxxxxxxxxx

# ============================================
# EMAIL (Nodemailer via Gmail App Password)
# ============================================
EMAIL_USER=yourstore@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
ADMIN_EMAIL=yourstore@gmail.com

# ============================================
# SHIPROCKET (add later when account created)
# ============================================
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
SHIPROCKET_PICKUP_LOCATION=Primary
SHIPROCKET_WEBHOOK_TOKEN=change-this-to-a-random-secret
SHIPROCKET_CHANNEL_ID=

# ============================================
# STORE ADDRESS (for return shipments + pickup)
# ============================================
STORE_PICKUP_PINCODE=400001
STORE_ADDRESS=123 Fashion Street
STORE_CITY=Mumbai
STORE_STATE=Maharashtra
STORE_PHONE=9876543210

# ============================================
# WHATSAPP CLOUD API (add later when Meta account created)
# ============================================
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_BUSINESS_ACCOUNT_ID=