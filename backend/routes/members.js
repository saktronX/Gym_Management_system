const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema ────────────────────────────────────────────────────────────────────
// member(member_id PK AI, branch_id FK, name, gender, date_of_birth,
//        phone, email, address, gym_id FK)

// GET /members
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT member_id, name, gender, date_of_birth,
              phone, email, address, branch_id, gym_id
       FROM member
       ORDER BY member_id DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /members
router.post("/", async (req, res) => {
  const { name, gender, date_of_birth, phone, email, address, branch_id, gym_id } = req.body;
  if (!name || !gender || !date_of_birth || !phone || !address) {
    return res.status(400).json({ success: false, message: "name, gender, date_of_birth, phone, address are required." });
  }
  try {
    const [result] = await db.query(
      `INSERT INTO member (name, gender, date_of_birth, phone, email, address, branch_id, gym_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gender, date_of_birth, phone, email || null, address, branch_id || null, gym_id || null]
    );
    res.status(201).json({ success: true, message: "Member added.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /members/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, gender, date_of_birth, phone, email, address, branch_id, gym_id } = req.body;
  if (!name || !gender || !phone || !address) {
    return res.status(400).json({ success: false, message: "name, gender, phone, address are required." });
  }
  try {
    const [result] = await db.query(
      `UPDATE member
       SET name=?, gender=?, date_of_birth=?, phone=?, email=?, address=?, branch_id=?, gym_id=?
       WHERE member_id=?`,
      [name, gender, date_of_birth || null, phone, email || null, address, branch_id || null, gym_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    res.json({ success: true, message: "Member updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /members/:id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM member WHERE member_id=?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    res.json({ success: true, message: "Member deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
