
import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

console.log('MongoDB Connector: MONGODB_URI loaded -', MONGODB_URI ? 'Yes' : 'No');
console.log('MongoDB Connector: MONGODB_DB_NAME loaded -', MONGODB_DB_NAME ? 'Yes' : 'No');

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local or .env'
  );
}
if (!MONGODB_DB_NAME) {
  throw new Error(
    'Please define the MONGODB_DB_NAME environment variable inside .env.local or .env'
  );
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    // Ensure the client is still connected
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return { client: cachedClient, db: cachedDb };
    } catch (error) {
      console.warn('Cached MongoDB client connection lost. Reconnecting...');
      cachedClient = null;
      cachedDb = null;
    }
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    cachedClient = client;
    cachedDb = db;

    console.log('Successfully connected to MongoDB and database:', MONGODB_DB_NAME);
    return { client, db };
  } catch (error) {
    console.error('Failed to connect to MongoDB. URI used:', MONGODB_URI, 'DB Name:', MONGODB_DB_NAME);
    console.error('Detailed connection error:', error);
    throw new Error('Could not connect to database. Check server logs for details.');
  }
}
