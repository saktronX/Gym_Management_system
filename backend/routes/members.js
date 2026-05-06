const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /members — fetch all members
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM member");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /members — add a new member
router.post("/", async (req, res) => {
  const { name, gender, date_of_birth, phone, email, address, branch_id, gym_id } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO member (name, gender, date_of_birth, phone, email, address, branch_id, gym_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gender, date_of_birth, phone, email, address, branch_id, gym_id]
    );
    res.status(201).json({ message: "Member added", id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /members/:id — update member by member_id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, gender, date_of_birth, phone, email, address, branch_id, gym_id } = req.body;
  try {
    const [result] = await db.query(
      `UPDATE member
       SET name = ?, gender = ?, date_of_birth = ?, phone = ?, email = ?,
           address = ?, branch_id = ?, gym_id = ?
       WHERE member_id = ?`,
      [name, gender, date_of_birth, phone, email, address, branch_id, gym_id, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Member not found" });
    }
    res.json({ message: "Member updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /members/:id — delete member by member_id
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM member WHERE member_id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Member not found" });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
