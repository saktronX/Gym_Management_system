const express = require("express");
const cors    = require("cors");

// Route modules
const membersRouter     = require("./routes/members");
const trainersRouter    = require("./routes/trainers");
const paymentsRouter    = require("./routes/payments");
const enrollmentsRouter = require("./routes/enrollments");
const plansRouter       = require("./routes/plans");

// Startup DB connection check (exits if MySQL unreachable)
require("./db");

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/members",     membersRouter);
app.use("/trainers",    trainersRouter);
app.use("/payments",    paymentsRouter);
app.use("/enrollments", enrollmentsRouter);
app.use("/plans",       plansRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Gym Management System API is running 🏋️",
    version: "2.0.0",
    endpoints: ["/members", "/trainers", "/payments", "/enrollments", "/plans"],
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, message: err.message || "Internal server error." });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running at http://localhost:${PORT}`);
});
