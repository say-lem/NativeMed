// Manual mock for src/config/cloudinary.ts, wired up per test file via:
//   jest.mock('<relative path>/src/config/cloudinary', () => require('<relative path>/mocks/cloudinary.mock'));
// Keeps every test offline: no real uploads/deletes ever hit Cloudinary.

export const cloudinaryMock = {
  uploader: {
    destroy: jest.fn().mockResolvedValue({ result: 'ok' }),
    upload_stream: jest.fn(),
  },
  utils: {
    private_download_url: jest.fn().mockReturnValue('https://signed.example.com/mock-download'),
  },
};

export const uploadBuffer = jest.fn().mockResolvedValue({
  secure_url: 'https://cdn.example.com/mock-upload',
  public_id: 'mock_public_id',
});

export const CloudinaryFolders = {
  COURSE_VIDEOS: 'native-med/courses/videos',
  COURSE_AUDIOS: 'native-med/courses/audios',
  COURSE_PDFS: 'native-med/courses/pdfs',
  THUMBNAILS: 'native-med/thumbnails',
  CASE_IMAGES: 'native-med/cases/images',
  CASE_STATION_IMAGES: 'native-med/cases/station-images',
  FREE_PRODUCT_PDFS: 'native-med/free-products/pdfs',
  FREE_PRODUCT_COVERS: 'native-med/free-products/covers',
  CASE_BANK_OVERVIEW: 'native-med/case-bank/overview',
};

export default cloudinaryMock;
