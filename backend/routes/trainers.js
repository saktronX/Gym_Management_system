const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema ────────────────────────────────────────────────────────────────────
// trainer(trainer_id PK AI, name, specialization, phone, email, experience, gym_id FK)

// GET /trainers
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT trainer_id, name, specialization, phone, email, experience, gym_id
       FROM trainer
       ORDER BY trainer_id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /trainers
router.post("/", async (req, res) => {
  const { name, specialization, phone, email, experience, gym_id } = req.body;
  if (!name || !phone || !email) {
    return res.status(400).json({ success: false, message: "name, phone, email are required." });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO trainer (name, specialization, phone, email, experience, gym_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, specialization || null, phone, email, experience || 0, gym_id || null]
    );
    res.status(201).json({ success: true, message: "Trainer added.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /trainers/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, specialization, phone, email, experience, gym_id } = req.body;
  if (!name || !phone || !email) {
    return res.status(400).json({ success: false, message: "name, phone, email are required." });
  }
  try {
    const [result] = await db.query(
      `UPDATE trainer
       SET name=?, specialization=?, phone=?, email=?, experience=?, gym_id=?
       WHERE trainer_id=?`,
      [name, specialization || null, phone, email, experience || 0, gym_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found." });
    }
    res.json({ success: true, message: "Trainer updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /trainers/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM trainer WHERE trainer_id=?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Trainer not found." });
    }
    res.json({ success: true, message: "Trainer deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
