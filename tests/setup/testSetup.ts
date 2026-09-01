import mongoose from 'mongoose';

beforeAll(async () => {
  const uri = process.env.MONGO_MEMORY_URI;
  if (!uri) throw new Error('MONGO_MEMORY_URI not set — globalSetup did not run');
  await mongoose.connect(uri);
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
