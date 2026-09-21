-- AlterTable: add pointerDetectionEnabled to InterviewSession
ALTER TABLE "interview_sessions" ADD COLUMN "pointer_detection_enabled" BOOLEAN NOT NULL DEFAULT true;
