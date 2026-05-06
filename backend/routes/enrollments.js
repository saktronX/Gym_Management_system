const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /enrollments — fetch all enrollments
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM enrollment");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /enrollments — add a new enrollment
router.post("/", async (req, res) => {
  const { start_date, end_date, status, member_id, plan_id } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO enrollment (start_date, end_date, status, member_id, plan_id)
       VALUES (?, ?, ?, ?, ?)`,
      [start_date, end_date, status, member_id, plan_id]
    );
    res.status(201).json({ message: "Enrollment created", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /enrollments/:id — delete enrollment by enrollment_id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM enrollment WHERE enrollment_id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
