
'use server';

/**
 * @fileOverview Invoice summarization flow using Vertex AI.
 *
 * - summarizeInvoice - A function that summarizes invoice data.
 * - SummarizeInvoiceInput - The input type for the summarizeInvoice function.
 * - SummarizeInvoiceOutput - The return type for the summarizeInvoice function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeInvoiceInputSchema = z.object({
  vendor: z.string().describe('The name of the vendor.'),
  date: z.string().describe('The invoice date.'),
  total: z.number().describe('The total amount due on the invoice.'),
  lineItems: z.array(
    z.object({
      description: z.string().describe('Description of the item.'),
      amount: z.number().describe('Amount for the item.'),
    })
  ).describe('List of individual line items on the invoice.'),
});
export type SummarizeInvoiceInput = z.infer<typeof SummarizeInvoiceInputSchema>;

const SummarizeInvoiceOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the invoice.'),
});
export type SummarizeInvoiceOutput = z.infer<typeof SummarizeInvoiceOutputSchema>;

export async function summarizeInvoice(input: SummarizeInvoiceInput): Promise<SummarizeInvoiceOutput> {
  return summarizeInvoiceFlow(input);
}

const summarizeInvoicePrompt = ai.definePrompt({
  name: 'summarizeInvoicePrompt',
  input: {schema: SummarizeInvoiceInputSchema},
  output: {schema: SummarizeInvoiceOutputSchema},
  prompt: `You are an accounting assistant. Create a concise summary of the following invoice data, highlighting the vendor, date, and total amount due. Also mention key line items.

Vendor: {{{vendor}}}
Date: {{{date}}}
Total Amount: {{{total}}}
Line Items:
{{#each lineItems}}
- {{{description}}}: {{{amount}}}
{{/each}}`,
});

const summarizeInvoiceFlow = ai.defineFlow(
  {
    name: 'summarizeInvoiceFlow',
    inputSchema: SummarizeInvoiceInputSchema,
    outputSchema: SummarizeInvoiceOutputSchema,
  },
  async input => {
    const {output} = await summarizeInvoicePrompt(input);
    if (!output || typeof output.summary === 'undefined') {
      console.error("AI summarization output missing summary:", output);
      throw new Error('AI summarization failed: No summary received or summary field is missing from the model.');
    }
    return output;
  }
);

