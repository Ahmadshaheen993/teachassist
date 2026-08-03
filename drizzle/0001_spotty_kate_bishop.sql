CREATE TABLE `countries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(4) NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`currencyCode` varchar(8) NOT NULL,
	`pricePerPlan` decimal(8,2) NOT NULL DEFAULT '10',
	`pricePerSemester` decimal(8,2) NOT NULL DEFAULT '150',
	`isActive` boolean NOT NULL DEFAULT false,
	CONSTRAINT `countries_id` PRIMARY KEY(`id`),
	CONSTRAINT `countries_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `grades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stageId` int NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `grades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unitId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`objectives` json,
	`keywords` json,
	`pageFrom` int,
	`pageTo` int,
	`suggestedPeriods` int NOT NULL DEFAULT 1,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_credits` (
	`userId` int NOT NULL,
	`balance` int NOT NULL DEFAULT 0,
	CONSTRAINT `plan_credits_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `plan_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`docxStoragePath` varchar(500) NOT NULL,
	`fields` json NOT NULL,
	CONSTRAINT `plan_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lessonId` int NOT NULL,
	`templateId` int NOT NULL,
	`planDate` date,
	`periods` int NOT NULL DEFAULT 1,
	`status` enum('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
	`content` json,
	`docxPath` varchar(500),
	`pdfPath` varchar(500),
	`model` varchar(100),
	`inputTokens` int,
	`outputTokens` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('single_plan','semester') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(8) NOT NULL,
	`gateway` varchar(50) NOT NULL,
	`gatewayRef` varchar(255),
	`status` enum('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referral_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerUserId` int NOT NULL,
	`code` varchar(20) NOT NULL,
	`maxUses` int NOT NULL DEFAULT 10,
	`rewardThreshold` int NOT NULL DEFAULT 5,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referral_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `referral_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeId` int NOT NULL,
	`redeemedBy` int NOT NULL,
	`purchaseId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referral_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referral_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeId` int NOT NULL,
	`subscriptionId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referral_rewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `referral_rewards_codeId_unique` UNIQUE(`codeId`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int,
	`kind` enum('mawqif','youtube','link','calendar','official_form') NOT NULL,
	`title` varchar(255) NOT NULL,
	`url` varchar(500),
	`body` text,
	`tags` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT false,
	CONSTRAINT `resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_selections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(255),
	`countryId` int NOT NULL,
	`schoolId` int,
	`gradeId` int NOT NULL,
	`subjectId` int NOT NULL,
	`textbookId` int,
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_selections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`nameAr` varchar(255) NOT NULL,
	`city` varchar(100),
	`isVerified` boolean NOT NULL DEFAULT false,
	CONSTRAINT `schools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `stages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`termId` int NOT NULL,
	`source` enum('paid','referral_reward','admin_grant') NOT NULL,
	`purchaseId` int,
	`startsAt` date NOT NULL,
	`endsAt` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `terms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`academicYear` varchar(20) NOT NULL,
	`nameAr` varchar(50) NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date NOT NULL,
	CONSTRAINT `terms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `textbooks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`countryId` int NOT NULL,
	`subjectId` int NOT NULL,
	`gradeId` int NOT NULL,
	`termId` int,
	`title` varchar(255) NOT NULL,
	`editionYear` int,
	`sourceNote` text,
	CONSTRAINT `textbooks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`textbookId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `units_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worksheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` int,
	`lessonId` int,
	`content` json,
	`docxPath` varchar(500),
	`pdfPath` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worksheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `countryId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `schoolId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `fullName` varchar(255);