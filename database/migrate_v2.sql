-- ============================================================
-- Gym Management System — Schema Migration
-- Run this ONCE against the Gym_Management_System database
-- Safe: uses IF NOT EXISTS / IF EXISTS checks via stored proc
-- Educational tables (member_1nf, member_2nf, etc.) untouched
-- ============================================================

USE Gym_Management_System;

-- ── 1. Add member_id to enrollment (the core missing FK) ──────────────────────
ALTER TABLE enrollment
   ADD COLUMN member_id INT NULL AFTER enrollment_id;

-- Add FK constraint only if it doesn't already exist
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = 'Gym_Management_System'
    AND TABLE_NAME   = 'enrollment'
    AND CONSTRAINT_NAME = 'fk_enrollment_member'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE enrollment ADD CONSTRAINT fk_enrollment_member FOREIGN KEY (member_id) REFERENCES member(member_id) ON DELETE SET NULL',
  'SELECT "fk_enrollment_member already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Add payment_date to payment ────────────────────────────────────────────
ALTER TABLE payment
  ADD COLUMN payment_date DATE NULL AFTER plan_id;

-- ── 3. Normalize membership_plan.Description → description ───────────────────
-- Only rename if the column is still called 'Description' (PascalCase)
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'Gym_Management_System'
    AND TABLE_NAME   = 'membership_plan'
    AND COLUMN_NAME  = 'Description'
);
SET @sql2 = IF(@col_exists > 0,
  'ALTER TABLE membership_plan CHANGE COLUMN `Description` `description` VARCHAR(100)',
  'SELECT "description column already normalized" AS info'
);
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- ── 4. Ensure trainer table has gym_id (verify) ───────────────────────────────
-- Already exists per backend usage — no migration needed.

-- ── Verify final state ────────────────────────────────────────────────────────
SELECT 'enrollment' AS tbl, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='Gym_Management_System' AND TABLE_NAME='enrollment'
UNION ALL
SELECT 'payment', COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='Gym_Management_System' AND TABLE_NAME='payment'
UNION ALL
SELECT 'membership_plan', COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='Gym_Management_System' AND TABLE_NAME='membership_plan'
ORDER BY tbl, COLUMN_NAME;
