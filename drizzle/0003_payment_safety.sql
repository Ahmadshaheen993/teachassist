CREATE TABLE `payment_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int,
	`userId` int,
	`gateway` varchar(50) NOT NULL,
	`status` enum('success','failed','rejected','mismatch','duplicate') NOT NULL,
	`gatewayRef` varchar(255),
	`eventId` varchar(255),
	`errorCode` varchar(100),
	`details` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway` varchar(50) NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`purchaseId` int,
	`payloadHash` varchar(64) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_webhook_gateway_event_unique` UNIQUE(`gateway`,`eventId`)
);
--> statement-breakpoint
ALTER TABLE `purchases` ADD `countryId` int;--> statement-breakpoint
ALTER TABLE `purchases` ADD `termId` int;--> statement-breakpoint
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_gateway_ref_unique` UNIQUE(`gateway`,`gatewayRef`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_term_unique` UNIQUE(`userId`,`termId`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_purchase_unique` UNIQUE(`purchaseId`);--> statement-breakpoint
CREATE INDEX `payment_audit_purchase_idx` ON `payment_audit_logs` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `payment_audit_user_idx` ON `payment_audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `payment_audit_created_idx` ON `payment_audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `payment_webhook_purchase_idx` ON `payment_webhook_events` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `purchases_user_status_idx` ON `purchases` (`userId`,`status`);