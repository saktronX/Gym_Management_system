const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema (after migration) ──────────────────────────────────────────────────
// payment(payment_id PK AI, amount, payment_mode, status,
//         member_id FK→member, plan_id FK→membership_plan, payment_date)

// GET /payments — with member name JOIN
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.payment_id,
              p.amount,
              p.payment_mode,
              p.status,
              p.payment_date,
              p.member_id,
              p.plan_id,
              COALESCE(m.name, CONCAT('Member #', p.member_id)) AS memberName,
              COALESCE(mp.plan_name, CONCAT('Plan #', p.plan_id))  AS planName
       FROM payment p
       LEFT JOIN member         m  ON m.member_id = p.member_id
       LEFT JOIN membership_plan mp ON mp.plan_id  = p.plan_id
       ORDER BY p.payment_id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /payments
router.post("/", async (req, res) => {
  const { amount, payment_mode, status, member_id, plan_id, payment_date } = req.body;
  if (!amount || !payment_mode || !status || !member_id) {
    return res.status(400).json({ success: false, message: "amount, payment_mode, status, member_id are required." });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO payment (amount, payment_mode, status, member_id, plan_id, payment_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [amount, payment_mode, status, member_id, plan_id || null, payment_date || null]
    );
    res.status(201).json({ success: true, message: "Payment recorded.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /payments/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { amount, payment_mode, status, member_id, plan_id, payment_date } = req.body;
  if (!amount || !payment_mode || !status || !member_id) {
    return res.status(400).json({ success: false, message: "amount, payment_mode, status, member_id are required." });
  }
  try {
    const [result] = await db.query(
      `UPDATE payment
       SET amount=?, payment_mode=?, status=?, member_id=?, plan_id=?, payment_date=?
       WHERE payment_id=?`,
      [amount, payment_mode, status, member_id, plan_id || null, payment_date || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }
    res.json({ success: true, message: "Payment updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /payments/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM payment WHERE payment_id=?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Payment not found." });
    }
    res.json({ success: true, message: "Payment deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
