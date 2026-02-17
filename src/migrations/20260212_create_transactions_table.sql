-- Migration: create transactions table
-- Up
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  reference VARCHAR(100) NOT NULL,
  gateway ENUM('paystack','flutterwave') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status ENUM('pending','success','failed','processing') NOT NULL DEFAULT 'pending',
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY transactions_reference_unique (reference),
  KEY transactions_order_id_index (order_id),
  KEY transactions_user_id_index (user_id),
  KEY transactions_status_index (status),
  CONSTRAINT transactions_order_id_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT transactions_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Down
DROP TABLE IF EXISTS transactions;
