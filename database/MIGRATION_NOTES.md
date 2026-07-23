# Database Migration v2

This migration updates the existing Gym Management System database schema.

## Changes

- Added `member_id` to the `enrollment` table.
- Added a foreign key constraint between `enrollment.member_id` and `member.member_id`.
- Added `payment_date` to the `payment` table.
- Renamed `Description` to `description` in the `membership_plan` table.
- Added verification queries to validate the final schema.

## Purpose

These changes improve referential integrity, normalize the database schema, and align the database structure with the backend application.
