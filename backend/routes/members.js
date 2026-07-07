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
         le.freeze_until,
         le.freeze_reason,
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
              freeze_until: row.freeze_until || null,
              freeze_reason: row.freeze_reason || null,
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

// ── Membership helpers ────────────────────────────────────────────────────────

async function getMemberOr404(connection, memberId) {
  const [rows] = await connection.query(
    "SELECT member_id, name FROM member WHERE member_id = ?",
    [memberId]
  );
  return rows[0] || null;
}

async function getLatestEnrollment(connection, memberId) {
  const [rows] = await connection.query(
    `SELECT e.*, mp.plan_name, mp.fee AS plan_fee, mp.duration AS plan_duration
     FROM enrollment e
     LEFT JOIN membership_plan mp ON mp.plan_id = e.plan_id
     WHERE e.member_id = ?
     ORDER BY e.enrollment_id DESC
     LIMIT 1`,
    [memberId]
  );
  return rows[0] || null;
}

async function getPlan(connection, planId) {
  const [rows] = await connection.query(
    "SELECT plan_id, plan_name, fee, duration FROM membership_plan WHERE plan_id = ?",
    [planId]
  );
  return rows[0] || null;
}

function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function daysRemaining(endDate) {
  const iso = toDateStr(endDate);
  if (!iso) return null;
  const end = new Date(iso + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
}

function shapeMembershipPayload(enrollment) {
  if (!enrollment) {
    return {
      enrollment_id: null,
      plan_id: null,
      plan_name: null,
      plan_fee: null,
      status: null,
      start_date: null,
      end_date: null,
      remaining_days: null,
      freeze_until: null,
      freeze_reason: null,
      notes: null,
    };
  }
  const remaining = daysRemaining(enrollment.end_date);
  return {
    enrollment_id: enrollment.enrollment_id,
    plan_id: enrollment.plan_id,
    plan_name: enrollment.plan_name,
    plan_fee: enrollment.plan_fee,
    status: enrollment.status,
    start_date: enrollment.start_date,
    end_date: enrollment.end_date,
    remaining_days: remaining,
    freeze_until: enrollment.freeze_until || null,
    freeze_reason: enrollment.freeze_reason || null,
    notes: enrollment.notes || null,
  };
}

async function createEnrollmentPayment(connection, {
  memberId, planId, startDate, endDate, status, amount, discount, tax, notes,
  paymentMode = "Cash", paymentStatus = "Completed", paymentDate,
}) {
  const [enrollResult] = await connection.query(
    `INSERT INTO enrollment (member_id, start_date, end_date, plan_id, status, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [memberId, startDate, endDate, planId, status, notes || null]
  );

  const finalAmount = parseFloat(amount);
  const payDate = paymentDate || todayISO();
  const [paymentResult] = await connection.query(
    `INSERT INTO payment (amount, discount, tax, payment_mode, status, member_id, plan_id, payment_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      finalAmount,
      parseFloat(discount) || 0,
      parseFloat(tax) || 0,
      paymentMode,
      paymentStatus,
      memberId,
      planId,
      payDate,
      notes || null,
    ]
  );

  return {
    enrollment_id: enrollResult.insertId,
    payment_id: paymentResult.insertId,
  };
}

function resolveRenewStartDate(currentEnrollment, effectiveDate) {
  const effective = effectiveDate || todayISO();
  if (!currentEnrollment?.end_date) return effective;
  const end = toDateStr(currentEnrollment.end_date);
  if (end >= effective) {
    const d = new Date(end + "T12:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return effective;
}

// GET /members/:id/membership — current membership contract
router.get("/:id/membership", async (req, res) => {
  const { id } = req.params;
  try {
    const member = await getMemberOr404(db, id);
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    const enrollment = await getLatestEnrollment(db, id);
    res.json({ success: true, data: shapeMembershipPayload(enrollment) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /members/:id/renew — new enrollment + payment, extend expiry
router.post("/:id/renew", async (req, res) => {
  const { id } = req.params;
  const {
    plan_id, effective_date, duration_months, discount, tax, notes,
    payment_mode, amount, payment_date,
  } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const member = await getMemberOr404(connection, id);
    if (!member) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    const current = await getLatestEnrollment(connection, id);
    const planId = plan_id || current?.plan_id;
    if (!planId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "plan_id is required." });
    }

    const plan = await getPlan(connection, planId);
    if (!plan) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Selected plan not found." });
    }

    const months = parseInt(duration_months, 10) || parseInt(plan.duration, 10) || 1;
    const startDate = resolveRenewStartDate(current, effective_date);
    const endDate = addMonthsToDate(startDate, months);
    const planPrice = parseFloat(plan.fee) || 0;
    const disc = parseFloat(discount) || 0;
    const taxAmt = parseFloat(tax) || 0;
    const finalAmount = amount != null ? parseFloat(amount) : Math.max(0, planPrice - disc + taxAmt);

    if (finalAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Final amount must be greater than zero." });
    }

    const result = await createEnrollmentPayment(connection, {
      memberId: id,
      planId,
      startDate,
      endDate,
      status: "Active",
      amount: finalAmount,
      discount: disc,
      tax: taxAmt,
      notes,
      paymentMode: payment_mode || "Cash",
      paymentDate: payment_date || todayISO(),
    });

    await connection.commit();
    const enrollment = await getLatestEnrollment(db, id);
    res.json({
      success: true,
      message: "Membership renewed successfully.",
      ...result,
      membership: shapeMembershipPayload(enrollment),
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// POST /members/:id/upgrade — new enrollment with upgraded plan
router.post("/:id/upgrade", async (req, res) => {
  req.body._action = "upgrade";
  return handlePlanChange(req, res, "upgrade");
});

// POST /members/:id/downgrade — new enrollment with downgraded plan
router.post("/:id/downgrade", async (req, res) => {
  req.body._action = "downgrade";
  return handlePlanChange(req, res, "downgrade");
});

async function handlePlanChange(req, res, action) {
  const { id } = req.params;
  const {
    plan_id, effective_date, duration_months, discount, tax, notes,
    payment_mode, amount, payment_date,
  } = req.body;

  if (!plan_id) {
    return res.status(400).json({ success: false, message: "plan_id is required." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const member = await getMemberOr404(connection, id);
    if (!member) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    const current = await getLatestEnrollment(connection, id);
    const plan = await getPlan(connection, plan_id);
    if (!plan) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Selected plan not found." });
    }

    if (current && String(current.plan_id) === String(plan_id)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Member is already on the ${plan.plan_name} plan.`,
      });
    }

    const months = parseInt(duration_months, 10) || parseInt(plan.duration, 10) || 1;
    const startDate = effective_date || todayISO();
    const endDate = addMonthsToDate(startDate, months);
    const planPrice = parseFloat(plan.fee) || 0;
    const disc = parseFloat(discount) || 0;
    const taxAmt = parseFloat(tax) || 0;
    const finalAmount = amount != null ? parseFloat(amount) : Math.max(0, planPrice - disc + taxAmt);

    if (finalAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Final amount must be greater than zero." });
    }

    if (current?.enrollment_id) {
      const prevStatus = action === "upgrade" ? "Upgraded" : "Downgraded";
      await connection.query(
        "UPDATE enrollment SET status = ? WHERE enrollment_id = ?",
        [prevStatus, current.enrollment_id]
      );
    }

    const result = await createEnrollmentPayment(connection, {
      memberId: id,
      planId: plan_id,
      startDate,
      endDate,
      status: "Active",
      amount: finalAmount,
      discount: disc,
      tax: taxAmt,
      notes,
      paymentMode: payment_mode || "Cash",
      paymentDate: payment_date || todayISO(),
    });

    await connection.commit();
    const enrollment = await getLatestEnrollment(db, id);
    res.json({
      success: true,
      message: `Membership ${action}d successfully.`,
      ...result,
      membership: shapeMembershipPayload(enrollment),
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
}

// POST /members/:id/freeze — freeze current membership
router.post("/:id/freeze", async (req, res) => {
  const { id } = req.params;
  const { freeze_until, reason, notes } = req.body;

  if (!freeze_until) {
    return res.status(400).json({ success: false, message: "freeze_until is required." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const member = await getMemberOr404(connection, id);
    if (!member) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    const current = await getLatestEnrollment(connection, id);
    if (!current) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Member has no active membership to freeze." });
    }

    await connection.query(
      `UPDATE enrollment
       SET status = 'Frozen', freeze_until = ?, freeze_reason = ?, notes = COALESCE(?, notes)
       WHERE enrollment_id = ?`,
      [freeze_until, reason || null, notes || null, current.enrollment_id]
    );

    await connection.commit();
    const enrollment = await getLatestEnrollment(db, id);
    res.json({
      success: true,
      message: "Membership frozen successfully.",
      membership: shapeMembershipPayload(enrollment),
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// POST /members/:id/cancel — cancel current membership
router.post("/:id/cancel", async (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const member = await getMemberOr404(connection, id);
    if (!member) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    const current = await getLatestEnrollment(connection, id);
    if (!current) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Member has no membership to cancel." });
    }

    await connection.query(
      `UPDATE enrollment
       SET status = 'Cancelled', notes = COALESCE(?, notes)
       WHERE enrollment_id = ?`,
      [notes || null, current.enrollment_id]
    );

    await connection.commit();
    const enrollment = await getLatestEnrollment(db, id);
    res.json({
      success: true,
      message: "Membership cancelled. Member profile and payment history preserved.",
      membership: shapeMembershipPayload(enrollment),
    });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

// PUT /members/:id/membership — dispatch by action type (same logic as POST routes)
router.put("/:id/membership", async (req, res) => {
  const { action } = req.body;
  if (action === "renew") {
    req.method = "POST";
    return router.stack
      .find(r => r.route?.path === "/:id/renew" && r.route.methods.post)
      ?.route.stack[0].handle(req, res);
  }
  if (action === "upgrade") return handlePlanChange(req, res, "upgrade");
  if (action === "downgrade") return handlePlanChange(req, res, "downgrade");
  if (action === "freeze") {
    return router.stack
      .find(r => r.route?.path === "/:id/freeze" && r.route.methods.post)
      ?.route.stack[0].handle(req, res);
  }
  if (action === "cancel") {
    return router.stack
      .find(r => r.route?.path === "/:id/cancel" && r.route.methods.post)
      ?.route.stack[0].handle(req, res);
  }
  return res.status(400).json({
    success: false,
    message: "action is required: renew, upgrade, downgrade, freeze, or cancel.",
  });
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
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [memberRows] = await connection.query(
      "SELECT member_id FROM member WHERE member_id=?",
      [id]
    );
    if (!memberRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }

    // Delete dependent rows first to satisfy FK constraints.
    await connection.query("DELETE FROM payment WHERE member_id=?", [id]);
    await connection.query("DELETE FROM enrollment WHERE member_id=?", [id]);

    const [result] = await connection.query("DELETE FROM member WHERE member_id=?", [id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    await connection.commit();
    res.json({ success: true, message: "Member deleted." });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
