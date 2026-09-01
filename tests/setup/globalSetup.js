require('./env');
const { MongoMemoryServer } = require('mongodb-memory-server');

// One in-memory Mongo shared by every test file — spinning up a fresh mongod
// per file would be far slower. process.env set here is inherited by the
// worker processes Jest forks for each test file.
module.exports = async function globalSetup() {
  const instance = await MongoMemoryServer.create();
  global.__MONGO_INSTANCE__ = instance;
  process.env.MONGO_MEMORY_URI = instance.getUri();
};
