-- AlterTable
ALTER TABLE "interview_sessions" ADD COLUMN     "warning_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "warning_limit" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "integrity_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "client_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "returned_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "counted" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,

    CONSTRAINT "integrity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrity_events_session_id_client_event_id_key" ON "integrity_events"("session_id", "client_event_id");

-- AddForeignKey
ALTER TABLE "integrity_events" ADD CONSTRAINT "integrity_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
