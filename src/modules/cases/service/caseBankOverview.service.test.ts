jest.mock('../../../config/cloudinary', () => require('../../../../tests/mocks/cloudinary.mock'));

import * as caseBankOverviewService from './caseBankOverview.service';
import { CaseBankOverview } from '../model/caseBankOverview.model';
import { cloudinaryMock, uploadBuffer } from '../../../../tests/mocks/cloudinary.mock';

describe('caseBankOverview.service', () => {
  beforeEach(() => {
    uploadBuffer.mockClear();
    cloudinaryMock.uploader.destroy.mockClear();
  });

  describe('getCaseBankOverview', () => {
    it('creates the singleton with sensible defaults on first read', async () => {
      expect(await CaseBankOverview.countDocuments()).toBe(0);

      const overview = await caseBankOverviewService.getCaseBankOverview();

      expect(await CaseBankOverview.countDocuments()).toBe(1);
      expect(overview.title).toBe('Case Bank Access');
      expect(overview.description).toContain('mock clinical cases');
      expect(overview.imageUrl).toBeUndefined();
    });
  });

  describe('updateCaseBankOverview', () => {
    it('updates title/description without creating a second document', async () => {
      await caseBankOverviewService.updateCaseBankOverview({ title: 'v1' });
      const updated = await caseBankOverviewService.updateCaseBankOverview({ description: 'A new description.' });

      expect(await CaseBankOverview.countDocuments()).toBe(1);
      expect(updated.title).toBe('v1');
      expect(updated.description).toBe('A new description.');
    });
  });

  describe('updateCaseBankOverviewImage', () => {
    it('uploads a new image and stores the url', async () => {
      const file = { buffer: Buffer.from('img') } as Express.Multer.File;

      const updated = await caseBankOverviewService.updateCaseBankOverviewImage(file);

      expect(updated.imageUrl).toBe('https://cdn.example.com/mock-upload');
      expect(uploadBuffer).toHaveBeenCalledWith(
        file.buffer,
        expect.objectContaining({ resource_type: 'image' }),
      );
      expect(cloudinaryMock.uploader.destroy).not.toHaveBeenCalled();
    });

    it('destroys the old image before uploading the new one', async () => {
      await caseBankOverviewService.updateCaseBankOverviewImage({ buffer: Buffer.from('img1') } as Express.Multer.File);
      uploadBuffer.mockResolvedValueOnce({
        secure_url: 'https://cdn.example.com/new-upload',
        public_id: 'new_public_id',
      });

      const updated = await caseBankOverviewService.updateCaseBankOverviewImage({
        buffer: Buffer.from('img2'),
      } as Express.Multer.File);

      expect(cloudinaryMock.uploader.destroy).toHaveBeenCalledWith('mock_public_id', { resource_type: 'image' });
      expect(updated.imageUrl).toBe('https://cdn.example.com/new-upload');
    });
  });
});
