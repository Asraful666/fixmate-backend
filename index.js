
const express = require("express");
const cors = require("cors");
require("dotenv").config();

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

// Temporary server health-check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate Backend Server is running!",
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`FixMate Server running on port ${PORT}`);
});
