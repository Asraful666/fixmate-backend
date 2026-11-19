const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyAdmin } = require("../middleware/authMiddleware");
const { ROLES, isValidObjectId } = require("../utils/validation");

const router = express.Router();

router.use(verifyAdmin);

// ADMIN DASHBOARD STATISTICS
router.get("/stats", async (req, res) => {
  try {
    const db = getDB();

    const [users, services, bookings, payments] = await Promise.all([
      db.collection("users").countDocuments(),
      db.collection("services").countDocuments(),
      db.collection("bookings").countDocuments(),
      db.collection("payments").countDocuments(),
    ]);

    const [
      customers,
      technicians,
      admins,
      pendingServices,
      approvedServices,
      requestedBookings,
      completedBookings,
    ] = await Promise.all([
      db.collection("users").countDocuments({ role: "customer" }),
      db.collection("users").countDocuments({ role: "technician" }),
      db.collection("users").countDocuments({ role: "admin" }),
      db.collection("services").countDocuments({ approvalStatus: "pending" }),
      db.collection("services").countDocuments({ approvalStatus: "approved" }),
      db.collection("bookings").countDocuments({ status: "requested" }),
      db.collection("bookings").countDocuments({ status: "completed" }),
    ]);

    const revenue = await db
      .collection("payments")
      .aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();

    return res.status(200).json({
      success: true,
      stats: {
        users,
        customers,
        technicians,
        admins,
        services,
        pendingServices,
        approvedServices,
        bookings,
        requestedBookings,
        completedBookings,
        payments,
        revenue: revenue[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard statistics.",
    });
  }
});

// ADMIN: LIST ALL SERVICES WITH APPROVAL STATE
router.get("/services", async (req, res) => {
  try {
    const { approvalStatus = "" } = req.query;
    const filter = {};

    if (["pending", "approved", "rejected"].includes(approvalStatus)) {
      filter.approvalStatus = approvalStatus;
    }

    const services = await getDB()
      .collection("services")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: services.length,
      services,
    });
  } catch (error) {
    console.error("Admin services error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load services.",
    });
  }
});

// ADMIN: APPROVE OR REJECT A SERVICE
router.patch("/services/:id/approval", async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalStatus } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "Approval status must be approved or rejected.",
      });
    }

    const services = getDB().collection("services");
    const service = await services.findOne({ _id: new ObjectId(id) });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    await services.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus, updatedAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: `Service ${approvalStatus}.`,
      approvalStatus,
    });
  } catch (error) {
    console.error("Admin service approval error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service approval.",
    });
  }
});

// ADMIN: LIST ALL BOOKINGS
router.get("/bookings", async (req, res) => {
  try {
    const { status = "" } = req.query;
    const filter = {};

    if (
      ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"].includes(
        status
      )
    ) {
      filter.status = status;
    }

    const bookings = await getDB()
      .collection("bookings")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: bookings.length,
      bookings,
    });
  } catch (error) {
    console.error("Admin bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load bookings.",
    });
  }
});

// ADMIN: LIST ALL PAYMENTS
router.get("/payments", async (req, res) => {
  try {
    const payments = await getDB()
      .collection("payments")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Admin payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load payments.",
    });
  }
});

// ADMIN: CHANGE A USER ROLE
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be customer, technician or admin.",
      });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role.",
      });
    }

    const users = getDB().collection("users");
    const user = await users.findOne({ _id: new ObjectId(id) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    await users.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role, updatedAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: `${user.name || user.email} is now ${role}.`,
      role,
    });
  } catch (error) {
    console.error("Admin role update error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user role.",
    });
  }
});

module.exports = router;
