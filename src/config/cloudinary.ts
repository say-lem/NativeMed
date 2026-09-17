import { v2 as cloudinary, UploadApiResponse, UploadApiOptions } from 'cloudinary';
import { env } from './env';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

export default cloudinary;

// ─────────────────────────────────────────────────────────────────────────────
// Folder constants
// Keep all assets under a root folder so the Cloudinary media library stays tidy.
// ─────────────────────────────────────────────────────────────────────────────

export const CloudinaryFolders = {
  COURSE_VIDEOS:        'native-med/courses/videos',
  COURSE_AUDIOS:        'native-med/courses/audios',
  COURSE_PDFS:          'native-med/courses/pdfs',
  THUMBNAILS:           'native-med/thumbnails',
  CASE_IMAGES:          'native-med/cases/images',
  CASE_STATION_IMAGES:  'native-med/cases/station-images',
  FREE_PRODUCT_PDFS:    'native-med/free-products/pdfs',
  FREE_PRODUCT_COVERS:  'native-med/free-products/covers',
  CASE_BANK_OVERVIEW:   'native-med/case-bank/overview',
  BOOKING_IMAGES:       'native-med/booking/images',
  FOUNDER_IMAGES:       'native-med/homepage/founder',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// uploadBuffer
// Wraps cloudinary.uploader.upload_stream in a Promise so the service can
// await it cleanly instead of dealing with Node stream callbacks directly.
//
// Usage:
//   const result = await uploadBuffer(file.buffer, {
//     folder: CloudinaryFolders.COURSE_VIDEOS,
//     resource_type: 'video',
//   });
//   result.secure_url  → CDN URL to store in DB
//   result.public_id   → ID needed to delete the asset later
// ─────────────────────────────────────────────────────────────────────────────

export const uploadBuffer = (
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      if (!result) return reject(new Error('Cloudinary returned an empty response'));
      resolve(result);
    });

    stream.end(buffer);
  });
};