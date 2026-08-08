-- Migration: Payment Security Gates Implementation
-- Purpose: Add comprehensive payment security infrastructure

-- 1. Add webhook_events table (البند 5: جدول webhook_events)
CREATE TABLE IF NOT EXISTS `webhook_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `gateway` varchar(50) NOT NULL COMMENT 'myfatoorah or tap',
  `eventId` varchar(255) NOT NULL,
  `payload` json,
  `status` enum('received', 'processed', 'failed') NOT NULL DEFAULT 'received',
  `error` text,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_webhook_event` (`gateway`, `eventId`),
  KEY `idx_gateway` (`gateway`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add payment_audit_logs table (البند 7: جدول audit logs)
CREATE TABLE IF NOT EXISTS `payment_audit_logs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `purchaseId` int,
  `userId` int,
  `gateway` varchar(50) NOT NULL,
  `status` enum('success', 'failed', 'rejected', 'mismatch') NOT NULL,
  `gatewayRef` varchar(255),
  `error` text,
  `details` json,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_purchaseId` (`purchaseId`),
  KEY `idx_userId` (`userId`),
  KEY `idx_gateway` (`gateway`),
  KEY `idx_status` (`status`),
  KEY `idx_createdAt` (`createdAt`)
  -- NO FOREIGN KEY: لا نحذف السجل المالي عند حذف الشراء (البند 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Add unique constraint to purchases (البند 5: unique gateway+gatewayRef)
ALTER TABLE `purchases` ADD UNIQUE KEY `unique_gateway_ref` (`gateway`, `gatewayRef`);

-- 4. Add unique constraint to subscriptions (البند 5: unique user+term)
ALTER TABLE `subscriptions` ADD UNIQUE KEY `unique_user_term` (`userId`, `termId`);

-- 5. Add webhook_id to purchases for replay attack prevention (البند 8)
ALTER TABLE `purchases` ADD COLUMN `webhookId` varchar(255) UNIQUE COMMENT 'Webhook ID for replay attack prevention' AFTER `gatewayRef`;

-- 6. Add index for faster webhook lookups
CREATE INDEX `idx_purchases_webhookId` ON `purchases` (`webhookId`);

-- 7. Ensure currency is not null (البند 8: لا تفترض QAR)
ALTER TABLE `purchases` MODIFY COLUMN `currency` varchar(8) NOT NULL;

-- 8. Ensure gatewayRef is not null (البند 8: غياب المرجع = رفض)
ALTER TABLE `purchases` MODIFY COLUMN `gatewayRef` varchar(255) NOT NULL;
