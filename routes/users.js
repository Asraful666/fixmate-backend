const express = require("express");
const { ObjectId } = require("mongodb");

const { getDB } = require("../config/db");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

const publicProfile = (user) => ({
  id: user._id.toString(),
  name: user.name || "",
  email: user.email || "",
  image: user.image || "",
  role: user.role || "customer",
  phone: user.phone || "",
  area: user.area || "",
  bio: user.bio || "",
  createdAt: user.createdAt || null,
});

// GET OWN PROFILE
router.get("/me", verifyToken, async (req, res) => {
  try {
    const user = await getDB()
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: publicProfile(user),
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load profile.",
    });
  }
});

// UPDATE OWN PROFILE (role is intentionally not writable here)
router.patch("/me", verifyToken, async (req, res) => {
  try {
    const { name, phone, area, bio, image } = req.body || {};

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return res.status(400).json({
        success: false,
        message: "Name cannot be empty.",
      });
    }

    const updates = { updatedAt: new Date() };

    if (name !== undefined) updates.name = name.trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (area !== undefined) updates.area = String(area).trim();
    if (bio !== undefined) updates.bio = String(bio).trim();
    if (image !== undefined) updates.image = String(image).trim();

    const users = getDB().collection("users");

    await users.updateOne({ _id: new ObjectId(req.user.id) }, { $set: updates });

    const user = await users.findOne({ _id: new ObjectId(req.user.id) });

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: publicProfile(user),
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update profile.",
    });
  }
});

// PUBLIC TECHNICIAN PROFILE (used by service details)
router.get("/technician/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid technician ID.",
      });
    }

    const user = await getDB()
      .collection("users")
      .findOne(
        { _id: new ObjectId(id), role: "technician" },
        { projection: { name: 1, image: 1, bio: 1, area: 1, role: 1 } }
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Technician not found.",
      });
    }

    return res.status(200).json({
      success: true,
      technician: {
        id: user._id.toString(),
        name: user.name || "",
        image: user.image || "",
        bio: user.bio || "",
        area: user.area || "",
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Get technician error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load technician.",
    });
  }
});

// ADMIN: LIST USERS
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const { role = "", search = "" } = req.query;
    const filter = {};

    if (role && ["customer", "technician", "admin"].includes(role)) {
      filter.role = role;
    }

    if (String(search).trim()) {
      const escaped = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    const users = await getDB()
      .collection("users")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      total: users.length,
      users: users.map(publicProfile),
    });
  } catch (error) {
    console.error("List users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load users.",
    });
  }
});

module.exports = router;
