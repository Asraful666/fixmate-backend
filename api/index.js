// Vercel serverless entry point.
// `vercel.json` rewrites every request here, and the Express app in
// `../app.js` handles the original URL path (/api/...).
const app = require("../app");
const { connectDB } = require("../config/db");

const initializeCollections = require("../database/collections");
const initializeIndexes = require("../database/indexes");

// Reuse one connection + one set of bootstrap queries per warm container.
const state = globalThis;

const prepare = async () => {
  if (!state.__fixmateDbReady) {
    state.__fixmateDbReady = (async () => {
      await connectDB();
      await initializeCollections();
      await initializeIndexes();
    })();

    // Allow a retry on the next request if the first attempt failed.
    state.__fixmateDbReady.catch(() => {
      state.__fixmateDbReady = null;
    });
  }

  await state.__fixmateDbReady;
};

module.exports = async (req, res) => {
  try {
    await prepare();
  } catch (error) {
    console.error("Serverless bootstrap failed:", error.message);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: "Database connection failed. Please try again.",
      })
    );
    return;
  }

  return app(req, res);
};
