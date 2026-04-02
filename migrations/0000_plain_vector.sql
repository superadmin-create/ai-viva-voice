CREATE TABLE "manual_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_slug" text NOT NULL,
	"question_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject_slug" text NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_data" text NOT NULL,
	"extracted_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"curriculum" jsonb NOT NULL,
	"instructions" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "viva_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"student_name" text NOT NULL,
	"student_email" text NOT NULL,
	"student_phone" text NOT NULL,
	"student_class" text DEFAULT '' NOT NULL,
	"student_division" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"max_score" integer DEFAULT 10 NOT NULL,
	"transcript" jsonb NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"sheet_synced" text DEFAULT 'pending',
	"student_photo" text
);
