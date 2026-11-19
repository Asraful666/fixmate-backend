require("dotenv").config();

const express = require("express");
const cors = require("cors");

const servicesRoutes = require("./routes/services");
const authRoutes = require("./routes/auth");
const bookingsRoutes = require("./routes/bookings");
const usersRoutes = require("./routes/users");
const adminRoutes = require("./routes/admin");
const paymentsRoutes = require("./routes/payments");
const handleStripeWebhook = require("./routes/paymentWebhook");

const app = express();

const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

const allowedOrigins = [
  clientUrl,
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
];

app.set("trust proxy", 1);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server calls and same-origin requests.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Stripe needs the untouched request body, so this route is mounted
// before express.json().
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());

// Health Check
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "FixMate Backend Server is running!",
  });
});

// Protected Auth API
app.use("/api/auth", authRoutes);

// Services API (public list/detail + technician CRUD)
app.use("/api/services", servicesRoutes);

// Bookings API (customer + technician flows)
app.use("/api/bookings", bookingsRoutes);

// Users / profile + admin user role management
app.use("/api/users", usersRoutes);

// Admin dashboard APIs
app.use("/api/admin", adminRoutes);

// Stripe payment APIs
app.use("/api/payments", paymentsRoutes);

// Unknown API route
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// Central error handler (also catches rejected CORS origins)
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error("Unhandled request error:", error.message);

  const status = error.message === "Not allowed by CORS" ? 403 : 500;

  return res.status(status).json({
    success: false,
    message:
      status === 403
        ? "Origin is not allowed to access this API."
        : "Something went wrong.",
  });
});

module.exports = app;
