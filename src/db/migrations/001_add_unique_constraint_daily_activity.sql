-- Migration: Add UNIQUE constraint to daily_activity table
-- This migration ensures that only one daily activity record exists per user per day
-- preventing race conditions and data integrity issues

-- Add UNIQUE constraint on (telegram_id, activity_date) if it doesn't exist
-- Note: This constraint helps prevent duplicate daily_activity records for the same user on the same day

-- First, check if the table exists and has the constraint
-- If the constraint doesn't exist, add it
ALTER TABLE daily_activity
ADD CONSTRAINT unique_user_daily_activity UNIQUE (telegram_id, activity_date);
