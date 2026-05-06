const express = require("express");
const cors = require("cors");

// Import route modules
const membersRouter = require("./routes/members");
const trainersRouter = require("./routes/trainers");
const paymentsRouter = require("./routes/payments");
const enrollmentsRouter = require("./routes/enrollments");
const plansRouter = require("./routes/plans");

// Importing db triggers the startup connection check.
// If MySQL is unreachable, process.exit(1) is called from db.js.
require("./db");

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors()); // Allow all origins (frontend is a plain HTML file)
app.use(express.json()); // Parse JSON request bodies

// ── Routes ───────────────────────────────────────────────────
app.use("/members", membersRouter);
app.use("/trainers", trainersRouter);
app.use("/payments", paymentsRouter);
app.use("/enrollments", enrollmentsRouter);
app.use("/plans", plansRouter);

// ── Health check ─────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Gym Management System API is running 🏋️" });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server running at http://localhost:${PORT}`);
});
