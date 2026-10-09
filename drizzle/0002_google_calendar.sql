CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid,
	"occurrence_key" text NOT NULL,
	"google_event_id" text,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"synced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connection" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"email" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text DEFAULT '' NOT NULL,
	"calendar_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broken_at" timestamp with time zone,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_connection_single_row" CHECK ("google_connection"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_task_occurrence_unique" ON "calendar_events" USING btree ("task_id","occurrence_key");--> statement-breakpoint
CREATE INDEX "calendar_events_live_idx" ON "calendar_events" USING btree ("task_id") WHERE "calendar_events"."deleted_at" is null;