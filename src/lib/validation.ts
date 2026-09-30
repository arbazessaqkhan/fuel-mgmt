import { z } from "zod";

export const voucherCreateSchema = z.object({
  voucherNo: z
    .string()
    .trim()
    .min(1, "Voucher number is required")
    .max(50, "Voucher number must be 50 characters or fewer"),
  vehicleNo: z
    .string()
    .trim()
    .min(1, "Vehicle number is required")
    .max(30, "Vehicle number must be 30 characters or fewer"),
  liters: z
    .number({ message: "Liters must be a number" })
    .positive("Liters must be greater than zero")
    .max(100000, "Liters is unrealistically large"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), {
      message: "Date is not a valid calendar date",
    }),
  imageUrl: z
    .string()
    .trim()
    .max(500, "Image URL too long")
    .regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "Image URL must be a local /uploads/ path")
    .nullish(),
});

export const voucherUpdateSchema = voucherCreateSchema.partial();

export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;
export type VoucherUpdateInput = z.infer<typeof voucherUpdateSchema>;
