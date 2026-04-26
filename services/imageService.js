const cloudinary = require('cloudinary').v2;
const Image = require('../models/Image');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Extracts image metadata and data from a Base64 string.
 * @param {string} base64String 
 * @returns {object} { data, contentType }
 */
function parseBase64(base64String) {
  const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  return {
    contentType: matches[1],
    data: matches[2]
  };
}

/**
 * Saves a new image to Cloudinary and optionally deletes the old one.
 * @param {string} base64Data - The new Base64 string
 * @param {string} oldImageUrl - (Optional) The URL of the old image to delete from Cloudinary
 * @returns {Promise<string>} - The URL of the newly saved image
 */
async function saveImage(base64Data, oldImageUrl = null) {
  if (!base64Data || !base64Data.startsWith('data:image/')) {
    return base64Data; // Return as is if not a data URL
  }

  try {
    // Upload to Cloudinary
    const uploadResponse = await cloudinary.uploader.upload(base64Data, {
      folder: 'dp_sell',
      resource_type: 'auto'
    });

    // Delete old image if provided and it's a Cloudinary URL
    if (oldImageUrl && oldImageUrl.includes('cloudinary.com')) {
      try {
        const publicId = extractPublicIdFromUrl(oldImageUrl);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
          console.log(`[ImageService] Deleted old Cloudinary image: ${publicId}`);
        }
      } catch (err) {
        console.error(`[ImageService] Error deleting old image from Cloudinary:`, err.message);
      }
    }

    return uploadResponse.secure_url;
  } catch (err) {
    console.error('[ImageService] Cloudinary upload error:', err);
    return null;
  }
}

/**
 * Deletes an image from Cloudinary by its URL.
 * @param {string} imageUrl 
 */
async function deleteImage(imageUrl) {
  if (!imageUrl || !imageUrl.includes('cloudinary.com')) return;
  try {
    const publicId = extractPublicIdFromUrl(imageUrl);
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
      console.log(`[ImageService] Deleted Cloudinary image: ${publicId}`);
    }
  } catch (err) {
    console.error(`[ImageService] Error deleting image from Cloudinary:`, err.message);
  }
}

/**
 * Extract public ID from a Cloudinary URL
 */
function extractPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Example: https://res.cloudinary.com/dsii87fft/image/upload/v123456789/dp_sell/public_id.jpg
  const parts = url.split('/');
  const fileNameWithExtension = parts[parts.length - 1];
  const publicIdWithFolder = parts.slice(parts.indexOf('upload') + 2).join('/').split('.')[0];
  
  return publicIdWithFolder;
}

/**
 * Extract image ID from a URL (Legacy MongoDB ID or Cloudinary URL)
 */
function extractIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  if (url.includes('cloudinary.com')) {
    return extractPublicIdFromUrl(url);
  }

  const parts = url.split('/');
  const lastPart = parts[parts.length - 1];
  
  if (lastPart && lastPart.match(/^[0-9a-fA-F]{24}$/)) {
    return lastPart;
  }
  
  return null;
}

/**
 * Format image URL (For Cloudinary, it's already a full URL)
 */
function getImageUrl(imageUrl) {
  return imageUrl;
}

module.exports = {
  saveImage,
  deleteImage,
  extractIdFromUrl,
  getImageUrl,
  cloudinary
};
