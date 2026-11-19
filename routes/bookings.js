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
  toPositiveNumber,
} = require("../utils/validation");

const router = express.Router();

const sortNewestFirst = { createdAt: -1 };

const toObjectIds = (ids) =>
  ids.filter(isValidObjectId).map((id) => new ObjectId(id));

// Every booking list also carries the current service card data, so the UI
// can render an image even before it fetches the service again.
const attachServices = async (db, bookings) => {
  if (bookings.length === 0) return [];

  const services = await db
    .collection("services")
    .find({ _id: { $in: toObjectIds(bookings.map((item) => item.serviceId)) } })
    .project({ title: 1, image: 1, category: 1, serviceMode: 1, serviceArea: 1 })
    .toArray();

  const serviceMap = new Map(
    services.map((service) => [service._id.toString(), service])
  );

  return bookings.map((booking) => ({
    ...booking,
    service: serviceMap.get(booking.serviceId) || null,
  }));
};

// GET BOOKINGS OF THE LOGGED-IN CUSTOMER
router.get("/my", verifyCustomer, async (req, res) => {
  try {
    const db = getDB();

    const bookings = await db
      .collection("bookings")
      .find({ customerEmail: req.user.email })
      .sort(sortNewestFirst)
      .toArray();

    return res.status(200).json({
      success: true,
      total: bookings.length,
      bookings: await attachServices(db, bookings),
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
      .find({ technicianEmail: req.user.email })
      .sort(sortNewestFirst)
      .toArray();

    return res.status(200).json({
      success: true,
      total: bookings.length,
      bookings: await attachServices(db, bookings),
    });
  } catch (error) {
    console.error("Get technician bookings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch service bookings.",
    });
  }
});

// CREATE A REPAIR REQUEST (customer only)
router.post("/", verifyCustomer, async (req, res) => {
  try {
    const body = req.body || {};

    const { serviceId, address, phone } = body;
    const preferredDate = body.preferredDate ?? body.bookingDate;
    const problemDescription = body.problemDescription ?? body.note;

    if (!isValidObjectId(serviceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const parsedDate = parseDateOnly(preferredDate);

    if (!parsedDate) {
      return res.status(400).json({
        success: false,
        message: "Please choose a valid preferred date.",
      });
    }

    if (parsedDate < startOfToday()) {
      return res.status(400).json({
        success: false,
        message: "Preferred date cannot be in the past.",
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

    // The PDF requires a real problem description, not a short note.
    if (
      typeof problemDescription !== "string" ||
      problemDescription.trim().length < 20
    ) {
      return res.status(400).json({
        success: false,
        message: "Problem description must be at least 20 characters.",
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

    // A customer cannot stack two active requests for the same service.
    const activeBooking = await db.collection("bookings").findOne({
      customerEmail: req.user.email,
      serviceId,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    });

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active request for this service. Please wait for it to finish.",
      });
    }

    const now = new Date();

    const booking = {
      serviceId,
      serviceTitle: service.title,
      serviceImage: service.image || "",
      category: service.category,
      serviceMode: service.serviceMode || "",
      serviceArea: service.serviceArea || "",
      basePrice: service.basePrice,
      technicianId: service.technicianId || "",
      technicianName: service.technicianName || "",
      technicianEmail: service.technicianEmail || "",
      customerId: req.user.id,
      customerName: req.user.name || "",
      customerEmail: req.user.email,
      customerPhone: phone.trim(),
      address: address.trim(),
      preferredDate: parsedDate,
      problemDescription: problemDescription.trim(),
      status: "requested",
      finalAmount: service.basePrice,
      paymentStatus: "unpaid",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("bookings").insertOne(booking);

    return res.status(201).json({
      success: true,
      message: "Repair request sent to the technician.",
      booking: { ...booking, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create the repair request.",
    });
  }
});

// CANCEL A BOOKING (customer, only while it is still "requested")
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

    if (booking.customerEmail !== req.user.email) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own bookings.",
      });
    }

    if (booking.status !== "requested") {
      return res.status(409).json({
        success: false,
        message: "Only a requested booking can be cancelled.",
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

// ADVANCE BOOKING STATUS (technician who owns the job only)
router.patch("/:id/status", verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, finalAmount } = req.body || {};

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

    if (booking.technicianEmail !== req.user.email) {
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

    // Completing a job must lock in the final price for the Stripe payment.
    if (status === "completed") {
      const amount = toPositiveNumber(finalAmount);

      if (amount === null) {
        return res.status(400).json({
          success: false,
          message: "Final amount must be a number greater than 0.",
        });
      }

      updates.finalAmount = amount;
    }

    await bookings.updateOne({ _id: new ObjectId(id) }, { $set: updates });

    return res.status(200).json({
      success: true,
      message: `Booking marked as ${status}.`,
      status,
      finalAmount: updates.finalAmount ?? booking.finalAmount,
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

    const db = getDB();
    const booking = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(id) });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const isOwner =
      booking.customerEmail === req.user.email ||
      booking.technicianEmail === req.user.email ||
      req.user.role === "admin";

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this booking.",
      });
    }

    const payment = await db
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
