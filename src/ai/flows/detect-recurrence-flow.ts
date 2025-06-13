
'use server';
/**
 * @fileOverview A flow to detect if an invoice is likely a recurring monthly expense.
 *
 * - detectRecurrence - A function that analyzes invoice details for recurrence.
 * - DetectRecurrenceInput - The input type for the detectRecurrence function.
 * - DetectRecurrenceOutput - The return type for the detectRecurrence function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const LineItemSchema = z.object({
  description: z.string().describe('A description of the line item.'),
  amount: z.number().describe('The amount for the line item.'),
});

const DetectRecurrenceInputSchema = z.object({
  vendor: z.string().describe('The name of the vendor.'),
  lineItems: z.array(LineItemSchema).describe('The line items on the invoice.'),
  // total: z.number().optional().describe('The total amount of the invoice, for context.'),
  // invoiceDate: z.string().optional().describe('The date of the invoice, for context.')
});
export type DetectRecurrenceInput = z.infer<typeof DetectRecurrenceInputSchema>;

const DetectRecurrenceOutputSchema = z.object({
  isLikelyRecurring: z
    .boolean()
    .describe('True if the invoice is likely a recurring monthly expense, false otherwise.'),
  reasoning: z
    .string()
    .optional()
    .describe('A brief explanation if the invoice is considered likely recurring (e.g., "Contains monthly subscription", "Known SaaS vendor"). Return empty string if not recurring or no specific reason stands out.'),
});
export type DetectRecurrenceOutput = z.infer<typeof DetectRecurrenceOutputSchema>;

export async function detectRecurrence(input: DetectRecurrenceInput): Promise<DetectRecurrenceOutput> {
  // Basic check: if no vendor or line items, unlikely to determine recurrence
  if (!input.vendor && input.lineItems.length === 0) {
    return { isLikelyRecurring: false, reasoning: "Insufficient data to determine recurrence." };
  }
  return detectRecurrenceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectRecurrencePrompt',
  input: {schema: DetectRecurrenceInputSchema},
  output: {schema: DetectRecurrenceOutputSchema},
  prompt: `You are an expert financial analyst. Your task is to determine if an invoice, based on its vendor and line items, is likely to be a recurring monthly expense.

Consider common indicators of recurring charges such as:
- Keywords like "subscription", "monthly plan", "service fee", "retainer", "license", "hosting", "membership".
- Vendor names known for subscription services (e.g., Netflix, Adobe, Salesforce, AWS, Zoom, Spotify, Microsoft Office 365, Google Workspace, etc.).
- Line item descriptions that imply an ongoing service rather than a one-time purchase.

Do not assume recurrence solely based on a common vendor if line items suggest a one-time purchase (e.g., "Hardware Purchase" from "Dell").

Vendor: {{{vendor}}}

Line Items:
{{#each lineItems}}
- Description: {{{description}}}, Amount: {{{amount}}}
{{/each}}

Based on the vendor and line items, is this invoice LIKELY a recurring MONTHLY expense?
If yes, briefly state the primary reason (e.g., "Contains 'monthly subscription' in line item", "Vendor is a known SaaS provider offering monthly services", "Line item suggests ongoing service").
If no, or if it's unclear or could be annual/quarterly, set isLikelyRecurring to false and reasoning can be empty or state "Not clearly monthly recurring".
Focus on MONTHLY recurrence.
`,
});

const detectRecurrenceFlow = ai.defineFlow(
  {
    name: 'detectRecurrenceFlow',
    inputSchema: DetectRecurrenceInputSchema,
    outputSchema: DetectRecurrenceOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    // Ensure output is not null and has the expected structure
    if (output && typeof output.isLikelyRecurring === 'boolean') {
      return {
        isLikelyRecurring: output.isLikelyRecurring,
        reasoning: output.reasoning || (output.isLikelyRecurring ? "AI determined as likely recurring." : undefined)
      };
    }
    // Fallback if AI returns unexpected output
    return { isLikelyRecurring: false, reasoning: "AI analysis for recurrence was inconclusive." };
  }
);
