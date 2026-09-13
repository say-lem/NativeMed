jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import { Types } from 'mongoose';
import * as freeProductsService from './freeProducts.service';
import { FreeProduct } from '../model/freeProducts.model';
import { cloudinaryMock, uploadBuffer } from '../../../../tests/mocks/cloudinary.mock';
import { objectId } from '../../../../tests/helpers/factories';

describe('freeProducts.service', () => {
  beforeEach(() => {
    uploadBuffer.mockClear();
    cloudinaryMock.uploader.destroy.mockClear();
    cloudinaryMock.utils.private_download_url.mockClear();
  });

  describe('createLinkProduct', () => {
    it('creates a link product with the given URL', async () => {
      const product = await freeProductsService.createLinkProduct(
        { title: 'Free Guide', description: 'A helpful guide', fileUrl: 'https://example.com/guide' },
        objectId(),
      );

      expect(product.type).toBe('link');
      expect(product.fileUrl).toBe('https://example.com/guide');
      expect(product.isPublished).toBe(true);
      expect(uploadBuffer).not.toHaveBeenCalled();
    });
  });

  describe('uploadPdfProduct', () => {
    it('uploads to Cloudinary as an authenticated raw asset and stores the product', async () => {
      const file = { buffer: Buffer.from('pdf') } as Express.Multer.File;

      const product = await freeProductsService.uploadPdfProduct(
        { title: 'Free PDF', description: 'A free handout', order: 1 },
        file,
        objectId(),
      );

      expect(product.type).toBe('pdf');
      expect(product.fileUrl).toBe('https://cdn.example.com/mock-upload');
      expect(uploadBuffer).toHaveBeenCalledWith(
        file.buffer,
        expect.objectContaining({ resource_type: 'raw', type: 'authenticated' }),
      );
    });
  });

  describe('uploadBlogProduct', () => {
    it('uploads a cover image and stores the blog content', async () => {
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;

      const product = await freeProductsService.uploadBlogProduct(
        { title: 'A Free Blog', content: 'A' + 'x'.repeat(25), order: 0 },
        file,
        objectId(),
      );

      expect(product.type).toBe('blog');
      expect(product.coverImageUrl).toBe('https://cdn.example.com/mock-upload');
      expect(product.content).toContain('xxxxx');
      expect(product.description).toBeUndefined();
      expect(uploadBuffer).toHaveBeenCalledWith(
        file.buffer,
        expect.objectContaining({ resource_type: 'image' }),
      );
    });
  });

  describe('replaceBlogCoverImage', () => {
    it('destroys the old cover image and stores the new one', async () => {
      const product = await freeProductsService.uploadBlogProduct(
        { title: 'A Free Blog', content: 'A' + 'x'.repeat(25), order: 0 },
        { buffer: Buffer.from('img') } as Express.Multer.File,
        objectId(),
      );
      cloudinaryMock.uploader.destroy.mockClear();
      uploadBuffer.mockResolvedValueOnce({
        secure_url: 'https://cdn.example.com/new-upload',
        public_id: 'new_public_id',
      });

      const updated = await freeProductsService.replaceBlogCoverImage(
        product._id.toString(),
        { buffer: Buffer.from('img2') } as Express.Multer.File,
      );

      expect(updated.coverImageUrl).toBe('https://cdn.example.com/new-upload');
      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('mock_public_id', { resource_type: 'image' });
    });

    it('rejects replacing the cover image on a non-blog product', async () => {
      const product = await FreeProduct.create({
        title: 'Link', type: 'link', fileUrl: 'https://a.com', description: 'x', createdBy: objectId(),
      });

      await expect(
        freeProductsService.replaceBlogCoverImage(product._id.toString(), { buffer: Buffer.from('img') } as Express.Multer.File),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 for a missing product', async () => {
      await expect(
        freeProductsService.replaceBlogCoverImage(new Types.ObjectId().toString(), { buffer: Buffer.from('img') } as Express.Multer.File),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getPublishedProducts', () => {
    it('only returns published products', async () => {
      await FreeProduct.create({
        title: 'Published', description: 'x', type: 'link', fileUrl: 'https://a.com',
        isPublished: true, createdBy: objectId(),
      });
      await FreeProduct.create({
        title: 'Unpublished', description: 'x', type: 'link', fileUrl: 'https://b.com',
        isPublished: false, createdBy: objectId(),
      });

      const result = await freeProductsService.getPublishedProducts();
      expect(result.total).toBe(1);
      expect(result.items[0].title).toBe('Published');
    });

    it('re-signs the PDF delivery URL fresh on every read', async () => {
      await FreeProduct.create({
        title: 'PDF', description: 'x', type: 'pdf', fileUrl: 'https://stale.example.com/old',
        publicId: 'pdf_public_id', isPublished: true, createdBy: objectId(),
      });

      const result = await freeProductsService.getPublishedProducts();

      expect(result.items[0].fileUrl).toBe('https://signed.example.com/mock-download');
      expect(cloudinaryMock.utils.private_download_url).toHaveBeenCalledWith('pdf_public_id', '', {
        resource_type: 'raw',
        type: 'authenticated',
      });
    });

    it('leaves link products untouched', async () => {
      await FreeProduct.create({
        title: 'Link', description: 'x', type: 'link', fileUrl: 'https://example.com/material',
        isPublished: true, createdBy: objectId(),
      });

      const result = await freeProductsService.getPublishedProducts();
      expect(result.items[0].fileUrl).toBe('https://example.com/material');
      expect(cloudinaryMock.utils.private_download_url).not.toHaveBeenCalled();
    });
  });

  describe('getPublishedProductById', () => {
    it('throws 404 for an unpublished product', async () => {
      const product = await FreeProduct.create({
        title: 'Hidden', description: 'x', type: 'link', fileUrl: 'https://a.com',
        isPublished: false, createdBy: objectId(),
      });

      await expect(
        freeProductsService.getPublishedProductById(product._id.toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 404 for a missing product', async () => {
      await expect(
        freeProductsService.getPublishedProductById(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('getAllProducts (admin)', () => {
    it('returns published and unpublished products', async () => {
      await FreeProduct.create({
        title: 'A', description: 'x', type: 'link', fileUrl: 'https://a.com',
        isPublished: true, createdBy: objectId(),
      });
      await FreeProduct.create({
        title: 'B', description: 'x', type: 'link', fileUrl: 'https://b.com',
        isPublished: false, createdBy: objectId(),
      });

      const result = await freeProductsService.getAllProducts();
      expect(result.total).toBe(2);
    });
  });

  describe('updateProduct', () => {
    it('updates metadata on a link product', async () => {
      const product = await FreeProduct.create({
        title: 'Old', description: 'x', type: 'link', fileUrl: 'https://a.com',
        createdBy: objectId(),
      });

      const updated = await freeProductsService.updateProduct(product._id.toString(), { title: 'New' });
      expect(updated.title).toBe('New');
    });

    it('allows editing fileUrl on a link product', async () => {
      const product = await FreeProduct.create({
        title: 'A', description: 'x', type: 'link', fileUrl: 'https://a.com',
        createdBy: objectId(),
      });

      const updated = await freeProductsService.updateProduct(product._id.toString(), { fileUrl: 'https://b.com' });
      expect(updated.fileUrl).toBe('https://b.com');
    });

    it('rejects editing fileUrl on a pdf product', async () => {
      const product = await FreeProduct.create({
        title: 'PDF', description: 'x', type: 'pdf', fileUrl: 'https://cdn.example.com/x',
        publicId: 'pdf_id', createdBy: objectId(),
      });

      await expect(
        freeProductsService.updateProduct(product._id.toString(), { fileUrl: 'https://evil.com' }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('throws 404 for a missing product', async () => {
      await expect(
        freeProductsService.updateProduct(new Types.ObjectId().toString(), { title: 'x' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('allows editing content on a blog product', async () => {
      const product = await freeProductsService.uploadBlogProduct(
        { title: 'A Free Blog', content: 'A' + 'x'.repeat(25), order: 0 },
        { buffer: Buffer.from('img') } as Express.Multer.File,
        objectId(),
      );

      const updated = await freeProductsService.updateProduct(product._id.toString(), {
        content: 'B' + 'y'.repeat(25),
      });
      expect(updated.content).toContain('yyyyy');
    });

    it('rejects editing content on a non-blog product', async () => {
      const product = await FreeProduct.create({
        title: 'Link', type: 'link', fileUrl: 'https://a.com', description: 'x', createdBy: objectId(),
      });

      await expect(
        freeProductsService.updateProduct(product._id.toString(), { content: 'x'.repeat(25) }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('setProductPublished', () => {
    it('unpublishes and republishes a product', async () => {
      const product = await FreeProduct.create({
        title: 'A', description: 'x', type: 'link', fileUrl: 'https://a.com',
        createdBy: objectId(),
      });

      const unpublished = await freeProductsService.setProductPublished(product._id.toString(), false);
      expect(unpublished.isPublished).toBe(false);

      const republished = await freeProductsService.setProductPublished(product._id.toString(), true);
      expect(republished.isPublished).toBe(true);
    });
  });

  describe('deleteProduct', () => {
    it('deleting a pdf also destroys the Cloudinary asset', async () => {
      const product = await FreeProduct.create({
        title: 'PDF', description: 'x', type: 'pdf', fileUrl: 'https://cdn.example.com/x',
        publicId: 'pdf_public_id', createdBy: objectId(),
      });

      await freeProductsService.deleteProduct(product._id.toString());

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('pdf_public_id', {
        resource_type: 'raw',
        type: 'authenticated',
      });
      expect(await FreeProduct.findById(product._id)).toBeNull();
    });

    it('deleting a blog also destroys the Cloudinary cover image', async () => {
      const product = await freeProductsService.uploadBlogProduct(
        { title: 'A Free Blog', content: 'A' + 'x'.repeat(25), order: 0 },
        { buffer: Buffer.from('img') } as Express.Multer.File,
        objectId(),
      );
      cloudinaryMock.uploader.destroy.mockClear();

      await freeProductsService.deleteProduct(product._id.toString());

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('mock_public_id', { resource_type: 'image' });
      expect(await FreeProduct.findById(product._id)).toBeNull();
    });

    it('deleting a link product leaves Cloudinary untouched', async () => {
      const product = await FreeProduct.create({
        title: 'Link', description: 'x', type: 'link', fileUrl: 'https://a.com',
        createdBy: objectId(),
      });

      await freeProductsService.deleteProduct(product._id.toString());
      expect(cloudinaryMock.uploader.destroy).not.toHaveBeenCalled();
    });

    it('throws 404 for a missing product', async () => {
      await expect(
        freeProductsService.deleteProduct(new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
