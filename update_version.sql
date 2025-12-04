-- Update settings table with new version
-- Run this SQL to update the database to version 1.1

UPDATE settings SET version = '1.1', system_version = '1.1';

-- Verify the update
SELECT version, system_version FROM settings;
