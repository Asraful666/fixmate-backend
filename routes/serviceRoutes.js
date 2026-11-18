
const express = require("express");
const { getDB } = require("../config/db");

const router = express.Router();

// GET /api/services
// Public: Fetch approved and available services
router.get("/", async (req, res) => {
  try {
    const db = getDB();

    const {
      search = "",
      category = "",
      serviceMode = "",
      sort = "newest",
    } = req.query;

    // Public services only
    const query = {
      approvalStatus: "approved",
      isAvailable: true,
    };

    // Search by title or category
    if (search.trim()) {
      const escapedSearch = search.trim().replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      query.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { category: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Category filter
    if (category.trim()) {
      query.category = category.trim();
    }

    // Service mode filter
    if (serviceMode.trim()) {
      query.serviceMode = serviceMode.trim();
    }

    // Sorting
    let sortOption = { createdAt: -1 };

    if (sort === "price-asc") {
      sortOption = { basePrice: 1 };
    } else if (sort === "price-desc") {
      sortOption = { basePrice: -1 };
    }

    const services = await db
      .collection("services")
      .find(query)
      .sort(sortOption)
      .toArray();

    return res.status(200).json({
      success: true,
      count: services.length,
      services,
    });

  } catch (error) {
    console.error("Fetch services error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch services.",
    });
  }
});

module.exports = router;
