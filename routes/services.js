const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyTechnician } = require("../middleware/authMiddleware");
const {
  CATEGORIES,
  SERVICE_MODES,
  isValidObjectId,
  isNonEmptyString,
  toPositiveNumber,
} = require("../utils/validation");

const router = express.Router();

// Escape special regex characters
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORT_OPTIONS = {
  "price-low": { basePrice: 1 },
  "price-high": { basePrice: -1 },
  newest: { createdAt: -1 },
};

// Keep only the fields a technician is allowed to set.
const readServicePayload = (body) => ({
  title: typeof body.title === "string" ? body.title.trim() : "",
  category: typeof body.category === "string" ? body.category.trim() : "",
  description:
    typeof body.description === "string" ? body.description.trim() : "",
  image: typeof body.image === "string" ? body.image.trim() : "",
  basePrice: toPositiveNumber(body.basePrice),
  serviceMode:
    typeof body.serviceMode === "string" ? body.serviceMode.trim() : "",
  estimatedDuration:
    typeof body.estimatedDuration === "string"
      ? body.estimatedDuration.trim()
      : "",
  serviceArea:
    typeof body.serviceArea === "string" ? body.serviceArea.trim() : "",
});

const validateServicePayload = (payload) => {
  if (!isNonEmptyString(payload.title)) {
    return "Service title is required.";
  }

  if (!CATEGORIES.includes(payload.category)) {
    return "Please select a valid category.";
  }

  if (!isNonEmptyString(payload.description)) {
    return "Service description is required.";
  }

  if (payload.basePrice === null) {
    return "Base price must be a positive number.";
  }

  if (!SERVICE_MODES.includes(payload.serviceMode)) {
    return "Service mode must be Home Visit or Shop Drop-off.";
  }

  if (!isNonEmptyString(payload.estimatedDuration)) {
    return "Estimated duration is required.";
  }

  if (!isNonEmptyString(payload.serviceArea)) {
    return "Service area is required.";
  }

  return null;
};

// GET ALL APPROVED AND AVAILABLE SERVICES
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category = "",
      serviceMode = "",
      sort = "newest",
    } = req.query;

    const filter = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    // Search
    if (String(search).trim()) {
      const safeSearch = escapeRegex(String(search).trim());

      filter.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
        { description: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Category filter
    if (String(category).trim()) {
      filter.category = String(category).trim();
    }

    // Service mode filter
    if (String(serviceMode).trim()) {
      filter.serviceMode = String(serviceMode).trim();
    }

    if (!SORT_OPTIONS[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sorting option.",
      });
    }

    const services = await db
      .collection("services")
      .find(filter)
      .sort(SORT_OPTIONS[sort])
      .toArray();

    return res.status(200).json({
      success: true,
      total: services.length,
      services,
    });
  } catch (error) {
    console.error("Get services error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch services.",
    });
  }
});

// GET TECHNICIAN'S OWN SERVICES (approved, pending, rejected)
router.get("/mine", verifyTechnician, async (req, res) => {
  try {
    const services = await getDB()
      .collection("services")
      .find({ technicianId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: services.length,
      services,
    });
  } catch (error) {
    console.error("Get my services error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch your services.",
    });
  }
});

// CREATE SERVICE (technician only, starts as pending approval)
router.post("/", verifyTechnician, async (req, res) => {
  try {
    const payload = readServicePayload(req.body || {});
    const validationError = validateServicePayload(payload);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const now = new Date();

    const service = {
      ...payload,
      technicianId: req.user.id,
      technicianName: req.user.name,
      technicianEmail: req.user.email,
      approvalStatus: "pending",
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await getDB().collection("services").insertOne(service);

    return res.status(201).json({
      success: true,
      message: "Service submitted for admin approval.",
      service: { ...service, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Create service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create service.",
    });
  }
});

// GET INDIVIDUAL SERVICE BY OBJECTID (public: approved + available only)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const service = await getDB().collection("services").findOne({
      _id: new ObjectId(id),
      approvalStatus: "approved",
      isAvailable: true,
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found or unavailable.",
      });
    }

    // Include a public technician profile for the details page.
    let technician = null;

    if (service.technicianEmail) {
      technician = await getDB().collection("users").findOne(
        { email: service.technicianEmail },
        { projection: { name: 1, image: 1, bio: 1, area: 1, role: 1 } }
      );
    }

    if (!technician && service.technicianId && isValidObjectId(service.technicianId)) {
      technician = await getDB().collection("users").findOne(
        { _id: new ObjectId(service.technicianId) },
        { projection: { name: 1, image: 1, bio: 1, area: 1, role: 1 } }
      );
    }

    return res.status(200).json({
      success: true,
      service,
      technician,
    });
  } catch (error) {
    console.error("Get service details error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch service details.",
    });
  }
});

// UPDATE SERVICE (owner only, edit resets approval to pending)
router.patch("/:id", verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const payload = readServicePayload(req.body || {});
    const validationError = validateServicePayload(payload);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const services = getDB().collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    if (existing.technicianId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own services.",
      });
    }

    const updates = {
      ...payload,
      approvalStatus: "pending",
      updatedAt: new Date(),
    };

    await services.updateOne({ _id: new ObjectId(id) }, { $set: updates });

    return res.status(200).json({
      success: true,
      message: "Service updated and sent for re-approval.",
      service: { ...existing, ...updates },
    });
  } catch (error) {
    console.error("Update service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service.",
    });
  }
});

// TOGGLE AVAILABILITY (owner only, does not reset approval)
router.patch("/:id/availability", verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const services = getDB().collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    if (existing.technicianId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only change your own services.",
      });
    }

    const isAvailable =
      typeof req.body?.isAvailable === "boolean"
        ? req.body.isAvailable
        : !existing.isAvailable;

    await services.updateOne(
      { _id: new ObjectId(id) },
      { $set: { isAvailable, updatedAt: new Date() } }
    );

    return res.status(200).json({
      success: true,
      message: isAvailable
        ? "Service is now available."
        : "Service is now unavailable.",
      isAvailable,
    });
  } catch (error) {
    console.error("Toggle availability error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change availability.",
    });
  }
});

// DELETE SERVICE (owner only, blocked while an active booking exists)
router.delete("/:id", verifyTechnician, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const db = getDB();
    const services = db.collection("services");
    const existing = await services.findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Service not found.",
      });
    }

    if (existing.technicianId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own services.",
      });
    }

    const activeBookings = await db.collection("bookings").countDocuments({
      serviceId: id,
      status: { $in: ["requested", "accepted", "in-progress"] },
    });

    if (activeBookings > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This service has active bookings. Complete or cancel them first.",
      });
    }

    await services.deleteOne({ _id: new ObjectId(id) });

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully.",
    });
  } catch (error) {
    console.error("Delete service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service.",
    });
  }
});

module.exports = router;
