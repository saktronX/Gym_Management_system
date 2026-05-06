const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /payments — fetch all payments
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM payment");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /payments — add a new payment
router.post("/", async (req, res) => {
  const { payment_date, amount, payment_mode, status, member_id, gym_id } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO payment (payment_date, amount, payment_mode, status, member_id, gym_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payment_date, amount, payment_mode, status, member_id, gym_id]
    );
    res.status(201).json({ message: "Payment recorded", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /payments/:id — delete payment by payment_id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM payment WHERE payment_id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
