-- CreateTable
CREATE TABLE `fuel_vouchers` (
    `id` VARCHAR(191) NOT NULL,
    `voucher_no` VARCHAR(191) NOT NULL,
    `vehicle_no` VARCHAR(191) NOT NULL,
    `liters` DOUBLE NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fuel_vouchers_voucher_no_key`(`voucher_no`),
    INDEX `fuel_vouchers_vehicle_no_idx`(`vehicle_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

