
import { config } from 'dotenv';
config();

import '@/ai/flows/extract-invoice-data.ts';
import '@/ai/flows/summarize-invoice.ts';
import '@/ai/flows/categorize-invoice-flow.ts';
import '@/ai/flows/detect-recurrence-flow.ts';
