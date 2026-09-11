import { Types } from 'mongoose';
import cloudinary, { CloudinaryFolders, uploadBuffer } from '../../../config/cloudinary';
import { AppError } from '../../../shared/utils/appError';
import { FreeProduct } from '../model/freeProducts.model';
import {
  CreateLinkFreeProductInput,
  UploadPdfFreeProductInput,
  UpdateFreeProductInput,
} from '../schema/freeProducts.schema';

// Admin create
export const createLinkProduct = async (
  input: CreateLinkFreeProductInput,
  createdBy: Types.ObjectId,
) => {
  return FreeProduct.create({
    title: input.title,
    description: input.description,
    type: 'link',
    fileUrl: input.fileUrl,
    createdBy,
  });
};

export const uploadPdfProduct = async (
  input: UploadPdfFreeProductInput,
  file: Express.Multer.File,
  createdBy: Types.ObjectId,
) => {
  const result = await uploadBuffer(file.buffer, {
    folder:          CloudinaryFolders.FREE_PRODUCT_PDFS,
    resource_type:   'raw',
    // Same reasoning as CourseContent PDFs — see getPdfDeliveryUrl below.
    type:            'authenticated',
    use_filename:    false,
    unique_filename: true,
    overwrite:       false,
  });

  return FreeProduct.create({
    title: input.title,
    description: input.description,
    type: 'pdf',
    fileUrl: result.secure_url,
    publicId: result.public_id,
    order: input.order,
    createdBy,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PDF delivery
//
// Cloudinary blocks unsigned CDN delivery of PDF/ZIP assets by URL extension
// regardless of delivery type (see the identical note in content.service.ts).
// The Admin API's private_download_url is the one thing that works, but its
// signed links are short-lived, so they're generated fresh on every read —
// never stored/cached — even though these products are publicly accessible
// with no auth on our side.
// ─────────────────────────────────────────────────────────────────────────────

const getPdfDeliveryUrl = (publicId: string): string =>
  cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'authenticated',
  });

const withDeliveryUrl = (product: InstanceType<typeof FreeProduct>) => {
  if (product.type === 'pdf' && product.publicId) {
    product.fileUrl = getPdfDeliveryUrl(product.publicId);
  }
  return product;
};

// ─────────────────────────────────────────────────────────────────────────────
// Public — open access, no auth
// ─────────────────────────────────────────────────────────────────────────────

export const getPublishedProducts = async (page = 1, limit = 20) => {
  const filter = { isPublished: true };
  const [items, total] = await Promise.all([
    FreeProduct.find(filter)
      .select('+publicId')
      .sort({ order: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    FreeProduct.countDocuments(filter),
  ]);
  items.forEach(withDeliveryUrl);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getPublishedProductById = async (productId: string) => {
  const product = await FreeProduct.findOne({ _id: productId, isPublished: true }).select('+publicId');
  if (!product) throw new AppError('Product not found', 404);
  return withDeliveryUrl(product);
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin — manage
// ─────────────────────────────────────────────────────────────────────────────

export const getAllProducts = async (page = 1, limit = 20) => {
  const [items, total] = await Promise.all([
    FreeProduct.find()
      .sort({ order: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    FreeProduct.countDocuments(),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const updateProduct = async (productId: string, input: UpdateFreeProductInput) => {
  const product = await FreeProduct.findById(productId);
  if (!product) throw new AppError('Product not found', 404);

  if (input.fileUrl && product.type !== 'link') {
    throw new AppError('fileUrl can only be edited on link products — delete and re-upload the PDF instead', 400);
  }

  Object.assign(product, input);
  await product.save();

  return product;
};

export const setProductPublished = async (productId: string, isPublished: boolean) => {
  return updateProduct(productId, { isPublished });
};

export const deleteProduct = async (productId: string): Promise<void> => {
  const product = await FreeProduct.findById(productId).select('+publicId');
  if (!product) throw new AppError('Product not found', 404);

  if (product.type === 'pdf' && product.publicId) {
    await cloudinary.uploader.destroy(product.publicId, {
      resource_type: 'raw',
      type: 'authenticated',
    });
  }

  await product.deleteOne();
};
