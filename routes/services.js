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

// Review summary for service cards and the details page.
const attachRatings = async (db, services) => {
  if (services.length === 0) return [];

  const ids = services.map((service) => service._id.toString());
  const stats = await db
    .collection("bookings")
    .aggregate([
      { $match: { serviceId: { $in: ids }, rating: { $gte: 1 } } },
      {
        $group: {
          _id: "$serviceId",
          average: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const map = new Map(
    stats.map((item) => [
      item._id,
      {
        rating: Math.round(item.average * 10) / 10,
        reviewCount: item.count,
      },
    ])
  );

  return services.map((service) => {
    const summary = map.get(service._id.toString());

    return {
      ...service,
      rating: summary?.rating || 0,
      reviewCount: summary?.reviewCount || 0,
    };
  });
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

  if (!isNonEmptyString(payload.image)) {
    return "Service image is required.";
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
      page = "1",
      limit = "9",
    } = req.query;

    const pageNumber = Math.max(Number.parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number.parseInt(limit, 10) || 9, 1),
      24
    );

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

    const collection = db.collection("services");
    const total = await collection.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    const services = await collection
      .find(filter)
      .sort(SORT_OPTIONS[sort])
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .toArray();

    return res.status(200).json({
      success: true,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      services: await attachRatings(db, services),
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
    const services = getDB().collection("services");

    // Pro plan: free technicians can publish up to 3 services.
    if (req.user.plan !== "pro") {
      const owned = await services.countDocuments({
        technicianId: req.user.id,
      });

      if (owned >= 3) {
        return res.status(403).json({
          success: false,
          message:
            "Free technicians can list up to 3 services. Upgrade to FixMate Pro for unlimited listings.",
        });
      }
    }

    const service = {
      ...payload,
      technicianId: req.user.id,
      technicianName: req.user.name,
      technicianEmail: req.user.email,
      technicianPlan: req.user.plan || "free",
      approvalStatus: "pending",
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await services.insertOne(service);

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
        { projection: { name: 1, image: 1, bio: 1, area: 1, role: 1, plan: 1 } }
      );
    }

    if (!technician && service.technicianId && isValidObjectId(service.technicianId)) {
      technician = await getDB().collection("users").findOne(
        { _id: new ObjectId(service.technicianId) },
        { projection: { name: 1, image: 1, bio: 1, area: 1, role: 1, plan: 1 } }
      );
    }

    const [ratedService] = await attachRatings(getDB(), [service]);

    return res.status(200).json({
      success: true,
      service: ratedService || service,
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

// PUBLIC REVIEWS FOR A SINGLE SERVICE
router.get("/:id/reviews", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service ID.",
      });
    }

    const reviews = await getDB()
      .collection("bookings")
      .find({ serviceId: id, rating: { $gte: 1 } })
      .sort({ reviewedAt: -1 })
      .limit(10)
      .project({ customerName: 1, rating: 1, review: 1, reviewedAt: 1 })
      .toArray();

    const average =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((sum, item) => sum + item.rating, 0) /
              reviews.length) *
              10
          ) / 10
        : 0;

    return res.status(200).json({
      success: true,
      total: reviews.length,
      average,
      reviews,
    });
  } catch (error) {
    console.error("Get service reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
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
      technicianPlan: req.user.plan || "free",
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
