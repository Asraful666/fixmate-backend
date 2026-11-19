const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const {
  verifyToken,
  verifyCustomer,
  verifyTechnician,
} = require("../middleware/authMiddleware");
const {
  ACTIVE_BOOKING_STATUSES,
  isValidObjectId,
  isNonEmptyString,
  parseDateOnly,
  startOfToday,
} = require("../utils/validation");

const router = express.Router();

const pendingPayment = () => ({ paymentStatus: "unpaid" });

const toObjectIds = (ids) =>
  ids.filter(isValidObjectId).map((id) => new ObjectId(id));

// Small helper so every list response has the same shape.
const sortNewestFirst = { createdAt: -1 };

// GET BOOKINGS OF THE LOGGED-IN CUSTOMER
router.get("/my", verifyCustomer, async (req, res) => {
  try {
    const db = getDB();

    const bookings = await db
      .collection("bookings")
      .find({ customerId: req.user.id })
      .sort(sortNewestFirst)
      .toArray();

    const services = await db
      .collection("services")
      .find({
        _id: { $in: toObjectIds(bookings.map((booking) => booking.serviceId)) },
      })
      .project({ title: 1, image: 1, category: 1 })
      .toArray();

    const serviceMap = new Map(
      services.map((service) => [service._id.toString(), service])
    );

    return res.status(200).json({
      success: true,
      total: bookings.length,
      bookings: bookings.map((booking) => ({
        ...booking,
        service: serviceMap.get(booking.serviceId) || null,
      })),
    });
  } catch (error) {
    console.error("Get my bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your bookings.",
    });
  }
});

// GET BOOKINGS THAT BELONG TO THE TECHNICIAN'S OWN SERVICES
router.get("/technician", verifyTechnician, async (req, res) => {
  try {
    const db = getDB();

    const bookings = await db
      .collection("bookings")
      .find({ technicianId: req.user.id })
      .sort(sortNewestFirst)
      .toArray();

    const services = await db
      .collection("services")
      .find({
        _id: { $in: toObjectIds(bookings.map((booking) => booking.serviceId)) },
      })
      .project({ title: 1, image: 1, category: 1 })
      .toArray();

    const serviceMap = new Map(
      services.map((service) => [service._id.toString(), service])
    );

    return res.status(200).json({
      success: true,
      total: bookings.length,
      bookings: bookings.map((booking) => ({
        ...booking,
        service: serviceMap.get(booking.serviceId) || null,
      })),
    });
  } catch (error) {
    console.error("Get technician bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch service bookings.",
    });
  }
});

// CREATE A BOOKING (customer only)
router.post("/", verifyCustomer, async (req, res) => {
  try {
    const { serviceId, bookingDate, address, phone, note } = req.body || {};

    if (!isValidObjectId(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const parsedDate = parseDateOnly(bookingDate);

    if (!parsedDate) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid booking date.",
      });
    }

    if (parsedDate < startOfToday()) {
      return res.status(400).json({
        success: false,
        message: "Booking date cannot be in the past.",
      });
    }

    if (!isNonEmptyString(address)) {
      return res.status(400).json({
        success: false,
        message: "Service address is required.",
      });
    }

    if (!isNonEmptyString(phone)) {
      return res.status(400).json({
        success: false,
        message: "Contact phone is required.",
      });
    }

    const db = getDB();
    const service = await db.collection("services").findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found or unavailable.",
      });
    }

    // A customer should not be able to stack duplicate active requests.
    const activeBooking = await db.collection("bookings").findOne({
      customerId: req.user.id,
      serviceId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active booking for this service. Please wait for it to finish.",
      });
    }

    const now = new Date();

    const booking = {
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone || phone.trim(),
      technicianId: service.technicianId,
      technicianName: service.technicianName,
      serviceId,
      serviceTitle: service.title,
      serviceMode: service.serviceMode,
      serviceArea: service.serviceArea,
      price: service.basePrice,
      bookingDate: parsedDate,
      address: address.trim(),
      phone: phone.trim(),
      note: typeof note === "string" ? note.trim() : "",
      status: "requested",
      ...pendingPayment(),
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("bookings").insertOne(booking);

    return res.status(201).json({
      success: true,
      message: "Booking request sent to the technician.",
      booking: { ...booking, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create booking.",
    });
  }
});

// CANCEL A BOOKING (customer, only before the job starts)
router.patch("/:id/cancel", verifyCustomer, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const bookings = getDB().collection("bookings");
    const booking = await bookings.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if (booking.customerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own bookings.",
      });
    }

    if (!["requested", "accepted"].includes(booking.status)) {
      return res.status(409).json({
        success: false,
        message: `A booking that is already ${booking.status} cannot be cancelled.`,
      });
    }

    await bookings.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled", updatedAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: "Booking cancelled.",
      status: "cancelled",
    });
  } catch (error) {
    console.error("Cancel booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel booking.",
    });
  }
});

// ADVANCE BOOKING STATUS (technician who owns the service only)
router.patch("/:id/status", verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const allowedTransitions = {
      requested: ["accepted", "rejected"],
      accepted: ["in-progress"],
      "in-progress": ["completed"],
    };

    const bookings = getDB().collection("bookings");
    const booking = await bookings.findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if (booking.technicianId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only update bookings for your own services.",
      });
    }

    const allowedNext = allowedTransitions[booking.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot change a ${booking.status} booking to ${status}.`,
      });
    }

    const updates = { status, updatedAt: new Date() };

    if (status === "rejected") {
      updates.rejectionReason =
        typeof reason === "string" ? reason.trim() : "";
    }

    await bookings.updateOne({ _id: new ObjectId(id) }, { $set: updates });

    return res.status(200).json({
      success: true,
      message: `Booking marked as ${status}.`,
      status,
    });
  } catch (error) {
    console.error("Update booking status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update booking status.",
    });
  }
});

// GET A SINGLE BOOKING (owner customer, service technician or admin)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getDB()
      .collection("bookings")
      .findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const isOwner =
      booking.customerId === req.user.id ||
      booking.technicianId === req.user.id ||
      req.user.role === "admin";

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this booking.",
      });
    }

    const payment = await getDB()
      .collection("payments")
      .findOne({ bookingId: id });

    return res.status(200).json({
      success: true,
      booking,
      payment: payment || null,
    });
  } catch (error) {
    console.error("Get booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch booking.",
    });
  }
});

module.exports = router;
