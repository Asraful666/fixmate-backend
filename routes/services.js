
const express = require("express");
const { getDB } = require("../config/db");

const router = express.Router();

// Escape special regex characters
const escapeRegex = (value) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/services
// Public: Get approved and available services
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category = "",
      serviceMode = "",
      sort = "newest",
    } = req.query;

    // Only approved and available services
    const filter = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    // Search by title or category
    if (search.trim()) {
      const safeSearch = escapeRegex(search.trim());

      filter.$or = [
        { title: { $regex: safeSearch, $options: "i" } },
        { category: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Category filter
    if (category.trim()) {
      filter.category = category.trim();
    }

    // Service mode filter
    if (serviceMode.trim()) {
      filter.serviceMode = serviceMode.trim();
    }

    // Server-side sorting
    const sortOptions = {
      "price-low": { basePrice: 1 },
      "price-high": { basePrice: -1 },
      newest: { createdAt: -1 },
    };

    if (!sortOptions[sort]) {
      return res.status(400).json({
        success: false,
        message: "Invalid sorting option.",
      });
    }

    const services = await db
      .collection("services")
      .find(filter)
      .sort(sortOptions[sort])
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

module.exports = router;
