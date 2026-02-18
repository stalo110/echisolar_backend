-- Basic schema for EchiSolar
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  passwordHash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  address TEXT,
  country VARCHAR(100),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  price DECIMAL(10,2),
  salePrice DECIMAL(10,2),
  stock INT DEFAULT 0,
  categoryId INT,
  images JSON,
  isLatestArrival BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cartItems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cartId INT,
  productId INT,
  quantity INT,
  FOREIGN KEY (cartId) REFERENCES carts(id),
  FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT,
  totalAmount DECIMAL(10,2),
  paymentStatus VARCHAR(50),
  status VARCHAR(50),
  shippingAddressId INT,
  placedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orderItems (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT,
  productId INT,
  quantity INT,
  unitPrice DECIMAL(10,2),
  FOREIGN KEY (orderId) REFERENCES orders(id),
  FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT,
  provider VARCHAR(50),
  paymentIntentId VARCHAR(255),
  amount DECIMAL(10,2),
  currency VARCHAR(10),
  status VARCHAR(50),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderId) REFERENCES orders(id)
);

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

CREATE TABLE IF NOT EXISTS installments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT,
  installmentNumber INT,
  dueDate DATETIME,
  amount DECIMAL(10,2),
  status ENUM('pending','paid','failed') DEFAULT 'pending',
  paidAt DATETIME DEFAULT NULL,
  FOREIGN KEY (orderId) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS gatewaySubscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT NOT NULL,
  userId INT NOT NULL,
  provider ENUM('paystack','flutterwave') NOT NULL,
  planReference VARCHAR(255) DEFAULT NULL,
  subscriptionReference VARCHAR(255) DEFAULT NULL,
  customerEmail VARCHAR(255) DEFAULT NULL,
  customerReference VARCHAR(255) DEFAULT NULL,
  status ENUM('active','inactive','cancelled','failed') NOT NULL DEFAULT 'active',
  metadata JSON DEFAULT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY gateway_subscriptions_order_idx (orderId),
  KEY gateway_subscriptions_user_idx (userId),
  KEY gateway_subscriptions_provider_plan_idx (provider, planReference),
  KEY gateway_subscriptions_provider_sub_idx (provider, subscriptionReference),
  KEY gateway_subscriptions_provider_email_idx (provider, customerEmail),
  UNIQUE KEY gateway_subscriptions_provider_subscription_unique (provider, subscriptionReference),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  images JSON,
  link VARCHAR(1024),
  isFeatured BOOLEAN DEFAULT FALSE,
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
