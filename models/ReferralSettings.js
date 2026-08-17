const mongoose = require('mongoose');

const referralSettingsSchema = new mongoose.Schema({
  isEnabled: { type: Boolean, default: true },
  rewardAmount: { type: Number, default: 100 },
  minimumOrderValue: { type: Number, default: 500 },
  rewardDescription: { type: String, default: 'Referral bonus' },
  maxReferralsPerUser: { type: Number, default: 10 },
  welcomeBonus: { type: Number, default: 50 },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Singleton - only one document
referralSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this();
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.model('ReferralSettings', referralSettingsSchema);