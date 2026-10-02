import crypto from 'crypto';
import cloudinary, { CloudinaryFolders } from '../../../config/cloudinary';
import { env } from '../../../config/env';
import { PdfUploadSignatureInput, PdfUploadTarget } from '../schema/uploads.schema';

const PDF_UPLOAD_FOLDERS: Record<PdfUploadTarget, string> = {
  'course-content':  CloudinaryFolders.COURSE_PDFS,
  'free-product':    CloudinaryFolders.FREE_PRODUCT_PDFS,
  'live-course-toc': CloudinaryFolders.LIVE_COURSE_TOC_PDFS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Signed direct-to-Cloudinary PDF upload
//
// Lets the browser send the PDF bytes straight to Cloudinary instead of
// through this API, so large files never hit a platform body-size limit
// (e.g. Vercel's 4.5MB function payload cap) on the way through our server.
// The server still controls what gets uploaded — folder, delivery type, and
// public_id are all decided here and baked into the signature, so the client
// can't redirect the upload anywhere else or overwrite an existing asset.
//
// type: 'authenticated' matches every other PDF upload in this codebase —
// Cloudinary blocks unsigned CDN delivery of PDF/ZIP assets by URL extension,
// so delivery URLs are generated fresh per-read via private_download_url
// (see content.service.ts / freeProducts.service.ts / liveCourses.service.ts).
// ─────────────────────────────────────────────────────────────────────────────

export const createPdfUploadSignature = (input: PdfUploadSignatureInput) => {
  const folder = PDF_UPLOAD_FOLDERS[input.target];
  const timestamp = Math.round(Date.now() / 1000);
  const publicId = crypto.randomUUID();

  const paramsToSign = {
    timestamp,
    folder,
    public_id: publicId,
    type: 'authenticated',
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
    timestamp,
    signature,
    folder,
    publicId,
    type: 'authenticated' as const,
  };
};
