const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema ────────────────────────────────────────────────────────────────────
// membership_plan(plan_id PK AI, plan_name, branch_id FK, fee NOT NULL,
//                 description, duration)

// GET /plans
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT plan_id, plan_name, fee, description, duration, branch_id
       FROM membership_plan
       ORDER BY plan_id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /plans
router.post("/", async (req, res) => {
  const { plan_name, fee, description, duration, branch_id } = req.body;
  if (!plan_name || fee == null) {
    return res.status(400).json({ success: false, message: "plan_name and fee are required." });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO membership_plan (plan_name, fee, description, duration, branch_id)
       VALUES (?, ?, ?, ?, ?)`,
      [plan_name, fee, description || null, duration || null, branch_id || null]
    );
    res.status(201).json({ success: true, message: "Plan created.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /plans/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { plan_name, fee, description, duration, branch_id } = req.body;
  if (!plan_name || fee == null) {
    return res.status(400).json({ success: false, message: "plan_name and fee are required." });
  }
  try {
    const [result] = await db.query(
      `UPDATE membership_plan
       SET plan_name=?, fee=?, description=?, duration=?, branch_id=?
       WHERE plan_id=?`,
      [plan_name, fee, description || null, duration || null, branch_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }
    res.json({ success: true, message: "Plan updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /plans/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM membership_plan WHERE plan_id=?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Plan not found." });
    }
    res.json({ success: true, message: "Plan deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;