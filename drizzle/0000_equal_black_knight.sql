CREATE TABLE `files` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`note_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`object_key` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`course` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`version` integer NOT NULL,
	`source_hash` text NOT NULL,
	`package_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`excerpt` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`owner` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `key`)
);
--> statement-breakpoint
CREATE TABLE `note_revisions` (
	`owner` text NOT NULL,
	`note_id` text NOT NULL,
	`version` integer NOT NULL,
	`object_key` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `note_id`, `version`)
);
