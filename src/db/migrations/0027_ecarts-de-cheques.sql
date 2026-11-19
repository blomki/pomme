ALTER TABLE "cheque" ADD COLUMN "gap_settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cheque" ADD COLUMN "gap_settled_by" uuid;--> statement-breakpoint
ALTER TABLE "cheque" ADD CONSTRAINT "cheque_gap_settled_by_user_id_fk" FOREIGN KEY ("gap_settled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;