const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema (after migration) ──────────────────────────────────────────────────
// enrollment(enrollment_id PK AI, member_id FK→member, start_date, end_date,
//            plan_id FK→membership_plan, status)

// GET /enrollments — with member + plan name JOINs
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.enrollment_id,
              e.member_id,
              e.start_date,
              e.end_date,
              e.plan_id,
              e.status,
              COALESCE(m.name,  CONCAT('Member #', e.member_id)) AS memberName,
              COALESCE(mp.plan_name, CONCAT('Plan #', e.plan_id)) AS planName
       FROM enrollment e
       LEFT JOIN member          m  ON m.member_id = e.member_id
       LEFT JOIN membership_plan mp ON mp.plan_id  = e.plan_id
       ORDER BY e.enrollment_id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /enrollments
router.post("/", async (req, res) => {
  const { member_id, plan_id, start_date, end_date, status } = req.body;
  if (!plan_id || !start_date || !end_date || !status) {
    return res.status(400).json({ success: false, message: "plan_id, start_date, end_date, status are required." });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO enrollment (member_id, start_date, end_date, plan_id, status)
       VALUES (?, ?, ?, ?, ?)`,
      [member_id || null, start_date, end_date, plan_id, status]
    );
    res.status(201).json({ success: true, message: "Enrollment created.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /enrollments/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { member_id, plan_id, start_date, end_date, status } = req.body;
  if (!plan_id || !start_date || !end_date || !status) {
    return res.status(400).json({ success: false, message: "plan_id, start_date, end_date, status are required." });
  }
  try {
    const [result] = await db.query(
      `UPDATE enrollment
       SET member_id=?, start_date=?, end_date=?, plan_id=?, status=?
       WHERE enrollment_id=?`,
      [member_id || null, start_date, end_date, plan_id, status, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Enrollment not found." });
    }
    res.json({ success: true, message: "Enrollment updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /enrollments/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM enrollment WHERE enrollment_id=?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Enrollment not found." });
    }
    res.json({ success: true, message: "Enrollment deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
