-- Apply once to databases created before listing moderation was added.
-- New installs get this schema directly from the Sequelize models.
ALTER TABLE listings
  MODIFY COLUMN status ENUM('pending', 'active', 'rejected', 'sold') NOT NULL DEFAULT 'pending',
  ADD COLUMN review_reason VARCHAR(500) NULL;

ALTER TABLE users
  MODIFY COLUMN referred_by VARCHAR(36) NULL;

-- Older frontend records stored the referrer's referral code rather than ID.
UPDATE users AS referred_user
JOIN users AS referrer ON referrer.referral_code = referred_user.referred_by
SET referred_user.referred_by = referrer.id;

ALTER TABLE users
  MODIFY COLUMN referred_by CHAR(36) NULL;

-- Existing listings were already public, so preserve their current status.
