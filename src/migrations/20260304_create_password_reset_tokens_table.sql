CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  tokenHash VARCHAR(128) NOT NULL,
  expiresAt DATETIME NOT NULL,
  usedAt DATETIME DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY password_reset_tokens_hash_unique (tokenHash),
  KEY password_reset_tokens_user_idx (userId),
  KEY password_reset_tokens_expires_idx (expiresAt),
  CONSTRAINT password_reset_tokens_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
