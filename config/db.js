
const { MongoClient } = require("mongodb");

let client;
let database;

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME;

    if (!uri || !dbName) {
      throw new Error(
        "MONGODB_URI or DB_NAME is missing in environment variables."
      );
    }

    client = new MongoClient(uri);

    await client.connect();

    database = client.db(dbName);

    await database.command({ ping: 1 });

    console.log("MongoDB connected successfully!");
    console.log(`Database: ${dbName}`);

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

const getDB = () => {
  if (!database) {
    throw new Error("Database is not connected yet.");
  }

  return database;
};

module.exports = {
  connectDB,
  getDB,
};
