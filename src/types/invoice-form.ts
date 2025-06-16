
import { z } from 'zod';

export const ManualInvoiceEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  invoiceId: z.string().optional(), // For identifying invoice to update
  vendor: z.string().min(1, "Vendor name is required."),
  date: z.string().min(1, "Invoice date is required."), // Keep as string, validation handled by date picker / browser
  total: z.coerce.number().min(0, "Total must be zero or a positive number."),
  lineItems: z.array(z.object({
    description: z.string().min(1, "Line item description is required."),
    amount: z.coerce.number().min(0, "Line item amount must be zero or positive."), // Allow 0 for edits
  })).min(1, "At least one line item is required."),
  isMonthlyRecurring: z.boolean().optional().default(false),
  categoriesString: z.string().optional(), // User-provided comma-separated categories
});

export type ManualInvoiceEntryData = z.infer<typeof ManualInvoiceEntrySchema>;

