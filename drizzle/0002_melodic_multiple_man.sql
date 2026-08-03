ALTER TABLE `lessons` ADD `status` enum('draft','approved') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `textbooks` ADD `status` enum('draft','approved') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `status` enum('draft','approved') DEFAULT 'draft' NOT NULL;