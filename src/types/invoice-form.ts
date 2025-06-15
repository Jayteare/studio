
import { z } from 'zod';

export const ManualInvoiceEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  vendor: z.string().min(1, "Vendor name is required."),
  date: z.string().min(1, "Invoice date is required."), // Consider more specific date validation if needed
  total: z.coerce.number().positive("Total must be a positive number."),
  lineItems: z.array(z.object({
    description: z.string().min(1, "Line item description is required."),
    amount: z.coerce.number().positive("Line item amount must be a positive number."),
  })).min(1, "At least one line item is required."),
});

export type ManualInvoiceEntryData = z.infer<typeof ManualInvoiceEntrySchema>;
