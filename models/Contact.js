const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  // Contact details - admin configurable
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  instagram: { type: String, default: '' },
  facebook: { type: String, default: '' },
  youtube: { type: String, default: '' },
  twitter: { type: String, default: '' },
  // Custom fields
  customFields: [{
    label: String,
    value: String
  }],
  updatedAt: { type: Date, default: Date.now }
});

// Ensure only one contact document exists
contactSchema.statics.getDefault = async function() {
  let contact = await this.findOne();
  if (!contact) {
    contact = new this();
    await contact.save();
  }
  return contact;
};

module.exports = mongoose.model('Contact', contactSchema);