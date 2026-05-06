const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /trainers — fetch all trainers
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM trainer");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /trainers — add a new trainer
router.post("/", async (req, res) => {
  const { name, specialization, phone, email, experience, gym_id } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO trainer (name, specialization, phone, email, experience, gym_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, specialization, phone, email, experience, gym_id]
    );
    res.status(201).json({ message: "Trainer added", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /trainers/:id — delete trainer by trainer_id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM trainer WHERE trainer_id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Trainer not found" });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
