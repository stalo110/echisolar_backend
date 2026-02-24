CREATE TABLE IF NOT EXISTS packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) DEFAULT NULL,
  requiresCustomPrice BOOLEAN DEFAULT FALSE,
  images JSON,
  whatsappLink VARCHAR(1024),
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

SET @cart_items_has_package_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cartItems'
    AND COLUMN_NAME = 'packageId'
);
SET @cart_items_package_id_sql := IF(
  @cart_items_has_package_id = 0,
  'ALTER TABLE cartItems ADD COLUMN packageId INT DEFAULT NULL AFTER productId',
  'SELECT 1'
);
PREPARE stmt FROM @cart_items_package_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @cart_items_has_item_type := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cartItems'
    AND COLUMN_NAME = 'itemType'
);
SET @cart_items_item_type_sql := IF(
  @cart_items_has_item_type = 0,
  "ALTER TABLE cartItems ADD COLUMN itemType ENUM('product','package') NOT NULL DEFAULT 'product' AFTER packageId",
  'SELECT 1'
);
PREPARE stmt FROM @cart_items_item_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_items_has_package_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orderItems'
    AND COLUMN_NAME = 'packageId'
);
SET @order_items_package_id_sql := IF(
  @order_items_has_package_id = 0,
  'ALTER TABLE orderItems ADD COLUMN packageId INT DEFAULT NULL AFTER productId',
  'SELECT 1'
);
PREPARE stmt FROM @order_items_package_id_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_items_has_item_type := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orderItems'
    AND COLUMN_NAME = 'itemType'
);
SET @order_items_item_type_sql := IF(
  @order_items_has_item_type = 0,
  "ALTER TABLE orderItems ADD COLUMN itemType ENUM('product','package') NOT NULL DEFAULT 'product' AFTER packageId",
  'SELECT 1'
);
PREPARE stmt FROM @order_items_item_type_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @cart_items_has_package_fk := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cartItems'
    AND CONSTRAINT_NAME = 'cart_items_package_fk'
);
SET @cart_items_package_fk_sql := IF(
  @cart_items_has_package_fk = 0,
  'ALTER TABLE cartItems ADD CONSTRAINT cart_items_package_fk FOREIGN KEY (packageId) REFERENCES packages(id)',
  'SELECT 1'
);
PREPARE stmt FROM @cart_items_package_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @order_items_has_package_fk := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'orderItems'
    AND CONSTRAINT_NAME = 'order_items_package_fk'
);
SET @order_items_package_fk_sql := IF(
  @order_items_has_package_fk = 0,
  'ALTER TABLE orderItems ADD CONSTRAINT order_items_package_fk FOREIGN KEY (packageId) REFERENCES packages(id)',
  'SELECT 1'
);
PREPARE stmt FROM @order_items_package_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS userPackageEnrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  packageId INT NOT NULL,
  orderId INT DEFAULT NULL,
  status ENUM('opted_in','pending_payment','paid') NOT NULL DEFAULT 'opted_in',
  source ENUM('custom_request','cart_checkout') NOT NULL DEFAULT 'custom_request',
  selectedPrice DECIMAL(10,2) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY user_package_enrollments_user_idx (userId),
  KEY user_package_enrollments_package_idx (packageId),
  KEY user_package_enrollments_order_idx (orderId),
  KEY user_package_enrollments_status_idx (status),
  CONSTRAINT user_package_enrollments_user_fk FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_package_enrollments_package_fk FOREIGN KEY (packageId) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT user_package_enrollments_order_fk FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE SET NULL
);
