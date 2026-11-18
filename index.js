
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("./config/db");

const initializeCollections = require("./database/collections");
const initializeIndexes = require("./database/indexes");

// Routes
const serviceRoutes = require("./routes/serviceRoutes");

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate Backend Server is running!",
  });
});

// Public Services API
app.use("/api/services", serviceRoutes);

// Start Server
const startServer = async () => {
  try {
    await connectDB();

    await initializeCollections();

    await initializeIndexes();

    app.listen(PORT, () => {
      console.log(`FixMate Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
