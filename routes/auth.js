const express = require("express");

const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

// Small protected endpoint used to verify the JWT bridge.
// It also gives the frontend a reliable way to confirm the session.
router.get("/me", verifyToken, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

module.exports = router;
