CREATE TABLE IF NOT EXISTS contactMessages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('read','unread') NOT NULL DEFAULT 'unread',
  adminReply TEXT DEFAULT NULL,
  replyDate DATETIME DEFAULT NULL,
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY contact_messages_status_idx (status),
  KEY contact_messages_created_idx (createdAt)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  toEmail VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
  providerMessageId VARCHAR(255) DEFAULT NULL,
  errorMessage TEXT DEFAULT NULL,
  context JSON DEFAULT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentAt DATETIME DEFAULT NULL,
  KEY email_logs_type_idx (type),
  KEY email_logs_status_idx (status),
  KEY email_logs_created_idx (createdAt),
  KEY email_logs_to_email_idx (toEmail)
);
