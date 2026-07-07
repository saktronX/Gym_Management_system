const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Schema ────────────────────────────────────────────────────────────────────
// member(member_id PK AI, branch_id FK, name, gender, date_of_birth,
//        phone, email, address, gym_id FK)

/** Add months to a YYYY-MM-DD date string (for enrollment end_date from plan duration). */
function addMonthsToDate(dateStr, months) {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + parseInt(months, 10));
  return d.toISOString().slice(0, 10);
}

/** Today's date as YYYY-MM-DD (UTC-safe for DB DATE columns). */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

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

// POST /members/register — member + enrollment + payment in one transaction
router.post("/register", async (req, res) => {
  const {
    name, gender, date_of_birth, phone, email, address, branch_id, gym_id,
    plan_id, amount, payment_mode, status, payment_date,
  } = req.body;

  if (!name || !gender || !date_of_birth || !phone || !address) {
    return res.status(400).json({
      success: false,
      message: "name, gender, date_of_birth, phone, and address are required.",
    });
  }
  if (!plan_id || amount == null || !payment_mode || !status) {
    return res.status(400).json({
      success: false,
      message: "plan_id, amount, payment_mode, and payment status are required.",
    });
  }
  if (parseFloat(amount) <= 0) {
    return res.status(400).json({ success: false, message: "amount must be greater than zero." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Step 1 — insert member
    const [memberResult] = await connection.query(
      `INSERT INTO member (name, gender, date_of_birth, phone, email, address, branch_id, gym_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gender, date_of_birth, phone, email || null, address, branch_id || null, gym_id || null]
    );
    const memberId = memberResult.insertId;

    // Step 2 — resolve plan duration for enrollment end_date
    const [planRows] = await connection.query(
      `SELECT duration, fee FROM membership_plan WHERE plan_id = ?`,
      [plan_id]
    );
    if (!planRows.length) {
      throw new Error("Selected membership plan was not found.");
    }
    const durationMonths = parseInt(planRows[0].duration, 10) || 1;
    const startDate = todayISO();
    const endDate = addMonthsToDate(startDate, durationMonths);

    // Step 3 — create enrollment (Active from registration date)
    const [enrollResult] = await connection.query(
      `INSERT INTO enrollment (member_id, start_date, end_date, plan_id, status)
       VALUES (?, ?, ?, ?, 'Active')`,
      [memberId, startDate, endDate, plan_id]
    );

    // Step 4 — record initial payment
    const payDate = payment_date || todayISO();
    const [paymentResult] = await connection.query(
      `INSERT INTO payment (amount, payment_mode, status, member_id, plan_id, payment_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [parseFloat(amount), payment_mode, status, memberId, plan_id, payDate]
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      message: "Member registered successfully with enrollment and payment.",
      member_id: memberId,
      enrollment_id: enrollResult.insertId,
      payment_id: paymentResult.insertId,
    });
  } catch (err) {
    await connection.rollback();
    const friendly = err.message?.includes("ER_DUP_ENTRY")
      ? "A member with this phone number may already exist."
      : err.message || "Registration failed. No records were created.";
    res.status(500).json({ success: false, message: friendly });
  } finally {
    connection.release();
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

// GET /members/:id/profile — full member profile (member + latest enrollment/plan + latest payment)
router.get("/:id/profile", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT
         m.member_id,
         m.name,
         m.gender,
         m.date_of_birth,
         m.phone,
         m.email,
         m.address,
         m.branch_id,
         m.gym_id,
         le.enrollment_id,
         le.start_date   AS enrollment_start_date,
         le.end_date     AS enrollment_end_date,
         le.status       AS enrollment_status,
         mp.plan_id,
         mp.plan_name,
         mp.duration     AS plan_duration,
         mp.fee          AS plan_fee,
         lp.payment_id,
         lp.amount       AS payment_amount,
         lp.payment_mode,
         lp.status       AS payment_status,
         lp.payment_date,
         (SELECT MIN(d) FROM (
            SELECT start_date AS d FROM enrollment WHERE member_id = m.member_id
            UNION ALL
            SELECT payment_date AS d FROM payment WHERE member_id = m.member_id AND payment_date IS NOT NULL
          ) dates) AS registered_date
       FROM member m
       LEFT JOIN (
         SELECT e.*
         FROM enrollment e
         INNER JOIN (
           SELECT member_id, MAX(enrollment_id) AS max_id
           FROM enrollment
           GROUP BY member_id
         ) latest_e ON e.enrollment_id = latest_e.max_id
       ) le ON le.member_id = m.member_id
       LEFT JOIN membership_plan mp ON mp.plan_id = le.plan_id
       LEFT JOIN (
         SELECT p.*
         FROM payment p
         INNER JOIN (
           SELECT member_id, MAX(payment_id) AS max_id
           FROM payment
           GROUP BY member_id
         ) latest_p ON p.payment_id = latest_p.max_id
       ) lp ON lp.member_id = m.member_id
       WHERE m.member_id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    const row = rows[0];

    // Shape response for the profile modal (single payload, no extra round-trips)
    res.json({
      success: true,
      data: {
        member: {
          member_id: row.member_id,
          name: row.name,
          gender: row.gender,
          date_of_birth: row.date_of_birth,
          phone: row.phone,
          email: row.email,
          address: row.address,
          branch_id: row.branch_id,
          gym_id: row.gym_id,
        },
        enrollment: row.enrollment_id
          ? {
              enrollment_id: row.enrollment_id,
              start_date: row.enrollment_start_date,
              end_date: row.enrollment_end_date,
              status: row.enrollment_status,
              plan_id: row.plan_id,
              plan_name: row.plan_name,
              plan_duration: row.plan_duration,
              plan_fee: row.plan_fee,
            }
          : null,
        payment: row.payment_id
          ? {
              payment_id: row.payment_id,
              amount: row.payment_amount,
              payment_mode: row.payment_mode,
              status: row.payment_status,
              payment_date: row.payment_date,
            }
          : null,
        timeline: {
          registered: row.registered_date,
          membership_started: row.enrollment_start_date,
          latest_payment: row.payment_date,
          membership_ends: row.enrollment_end_date,
        },
      },
    });
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
