const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /plans — fetch all membership plans
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM membership_plan");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;