-- Rename pointer_detection_enabled to detection_enabled (broader: all events)
ALTER TABLE "interview_sessions" RENAME COLUMN "pointer_detection_enabled" TO "detection_enabled";
