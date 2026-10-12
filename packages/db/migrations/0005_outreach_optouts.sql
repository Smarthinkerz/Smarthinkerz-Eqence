CREATE TABLE "outreach_optouts" (
	"email" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
