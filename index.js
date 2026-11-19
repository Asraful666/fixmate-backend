const app = require("./app");
const { connectDB } = require("./config/db");

const initializeCollections = require("./database/collections");
const initializeIndexes = require("./database/indexes");

const PORT = process.env.PORT || 5000;

// Start Server
const startServer = async () => {
  try {
    await connectDB();

    await initializeCollections();

    await initializeIndexes();

    app.listen(PORT, () => {
      console.log(`FixMate Server running on port ${PORT}`);
      console.log(`Services API: http://localhost:${PORT}/api/services`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
