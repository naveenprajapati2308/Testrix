-- Manual group runs used to email the person who clicked Run, every single time. That is now
-- opt-in per group: only groups explicitly marked here send a report after a manual run.
-- Scheduled runs are unaffected — those already opt in by configuring API_SCHEDULE.recipients.
ALTER TABLE API_GROUP
    ADD COLUMN email_report BOOLEAN NOT NULL DEFAULT FALSE;
