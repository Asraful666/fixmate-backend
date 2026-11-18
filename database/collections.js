
const { getDB } = require("../config/db");

const collectionNames = [
  "services",
  "bookings",
  "payments",
];

const initializeCollections = async () => {
  try {
    const db = getDB();

    const existingCollections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const existingNames = existingCollections.map(
      (collection) => collection.name
    );

    for (const name of collectionNames) {
      if (!existingNames.includes(name)) {
        await db.createCollection(name);
        console.log(`Collection created: ${name}`);
      } else {
        console.log(`Collection already exists: ${name}`);
      }
    }

    console.log("Business collections initialized successfully!");
  } catch (error) {
    console.error(
      "Collection initialization failed:",
      error.message
    );

    throw error;
  }
};

module.exports = initializeCollections;
