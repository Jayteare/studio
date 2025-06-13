
'use server';
/**
 * @fileOverview A flow to categorize invoices based on vendor and line items.
 *
 * - categorizeInvoice - A function that suggests categories for an invoice.
 * - CategorizeInvoiceInput - The input type for the categorizeInvoice function.
 * - CategorizeInvoiceOutput - The return type for the categorizeInvoice function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LineItemSchema = z.object({
  description: z.string().describe('A description of the line item.'),
  amount: z.number().describe('The amount for the line item.'),
});

const CategorizeInvoiceInputSchema = z.object({
  vendor: z.string().describe('The name of the vendor.'),
  lineItems: z.array(LineItemSchema).describe('The line items on the invoice.'),
});
export type CategorizeInvoiceInput = z.infer<typeof CategorizeInvoiceInputSchema>;

const CategorizeInvoiceOutputSchema = z.object({
  categories: z
    .array(z.string())
    .describe(
      'An array of suggested business expense categories for the invoice (e.g., "Software Subscription", "Office Supplies", "Utilities"). Aim for 1 to 3 relevant categories.'
    ),
});
export type CategorizeInvoiceOutput = z.infer<typeof CategorizeInvoiceOutputSchema>;

export async function categorizeInvoice(input: CategorizeInvoiceInput): Promise<CategorizeInvoiceOutput> {
  return categorizeInvoiceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'categorizeInvoicePrompt',
  input: {schema: CategorizeInvoiceInputSchema},
  output: {schema: CategorizeInvoiceOutputSchema},
  prompt: `You are an expert accounting assistant. Your task is to suggest 1 to 3 relevant business expense categories for an invoice based on its vendor and line items.

Consider common business expense types. Examples: "Software Subscription", "Office Supplies", "Utilities", "Travel & Expenses", "Marketing", "Legal Fees", "Consulting Services", "Hardware Purchase", "Cloud Services".

Vendor: {{{vendor}}}

Line Items:
{{#each lineItems}}
- Description: {{{description}}}, Amount: {{{amount}}}
{{/each}}

Based on the vendor and line items, provide a list of 1 to 3 suitable categories.
`,
});

const categorizeInvoiceFlow = ai.defineFlow(
  {
    name: 'categorizeInvoiceFlow',
    inputSchema: CategorizeInvoiceInputSchema,
    outputSchema: CategorizeInvoiceOutputSchema,
  },
  async input => {
    // Basic input validation or preprocessing can go here if needed
    if (!input.vendor && input.lineItems.length === 0) {
      return { categories: ["Uncategorized"] };
    }

    const {output} = await prompt(input);
    
    // Ensure output is not null and categories array exists
    if (output && Array.isArray(output.categories)) {
      // Filter out empty strings or provide default if empty
      const filteredCategories = output.categories.filter(cat => cat.trim() !== "");
      if (filteredCategories.length === 0) {
        return { categories: ["General Expense"] };
      }
      return { categories: filteredCategories };
    }
    // Fallback if AI returns unexpected output
    return { categories: ["Needs Review"] };
  }
);
