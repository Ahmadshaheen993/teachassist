-- Independent email OTP is dormant until AUTH_OTP_ENABLED=true.
-- Do not apply to production without the staging preflight in docs/AUTH_STAGING.md.
-- Existing Manus users keep their openId, user ID, role, credits and purchases.
CREATE TABLE IF NOT EXISTS `otp_codes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `email` varchar(320) NOT NULL,
  `codeHash` varchar(64) NOT NULL,
  `purpose` enum('login','register') NOT NULL DEFAULT 'login',
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `otp_email_created` (`email`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_identity_limits` (
  `keyId` varchar(80) NOT NULL,
  `requestWindowAt` timestamp NOT NULL,
  `requestCount` int NOT NULL DEFAULT 0,
  `verifyWindowAt` timestamp NOT NULL,
  `verifyCount` int NOT NULL DEFAULT 0,
  `lastIssuedAt` timestamp NULL,
  `lockedUntil` timestamp NULL,
  PRIMARY KEY (`keyId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `tokenHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NOT NULL,
  `revokedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `auth_sessions_tokenHash_unique` UNIQUE (`tokenHash`),
  KEY `auth_sessions_user_created` (`userId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
