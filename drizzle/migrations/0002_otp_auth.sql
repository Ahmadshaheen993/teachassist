-- Migration: OTP Authentication (AUTH_SPEC_V2)
-- Purpose: Independent email+OTP authentication system

-- 1. Create otp_codes table
CREATE TABLE IF NOT EXISTS `otp_codes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `email` varchar(320) NOT NULL,
  `codeHash` varchar(64) NOT NULL COMMENT 'SHA-256 hash of OTP code (never stored in plain text)',
  `purpose` enum('login', 'register') NOT NULL DEFAULT 'login',
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_email` (`email`),
  KEY `idx_expiresAt` (`expiresAt`),
  KEY `idx_consumedAt` (`consumedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Make openId nullable (new users won't have Manus openId)
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64) NULL;

-- 3. Add unique index on email (for user linking during migration)
-- Note: Only apply if no duplicate emails exist
-- Check first: SELECT email, COUNT(*) as cnt FROM users WHERE email IS NOT NULL GROUP BY email HAVING cnt > 1;
ALTER TABLE `users` ADD UNIQUE KEY `unique_email` (`email`);
