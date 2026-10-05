-- Add fuel type column (Petrol / Diesel). Existing rows default to Diesel,
-- matching the most common voucher type in current data.
ALTER TABLE `fuel_vouchers` ADD COLUMN `fuel_type` VARCHAR(10) NOT NULL DEFAULT 'Diesel' AFTER `liters`;
