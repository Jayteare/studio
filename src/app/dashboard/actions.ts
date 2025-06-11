
'use server';

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { extractInvoiceData, type ExtractInvoiceDataOutput } from '@/ai/flows/extract-invoice-data';
import { summarizeInvoice, type SummarizeInvoiceOutput } from '@/ai/flows/summarize-invoice';
import type { Invoice, LineItem } from '@/types/invoice';

// Helper to convert File object from FormData to data URI
async function fileToDataUri(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64String = buffer.toString('base64');
  return `data:${file.type};base64,${base64String}`;
}

export interface UploadInvoiceFormState {
  invoice?: Invoice;
  error?: string;
  message?: string; // For general messages
}

const INVOICES_COLLECTION = 'uploaded_invoices';

export async function handleInvoiceUpload(
  prevState: UploadInvoiceFormState | undefined,
  formData: FormData
): Promise<UploadInvoiceFormState> {
  const file = formData.get('invoiceFile') as File;
  const userIdString = formData.get('userId') as string;

  if (!userIdString) {
    return { error: 'User ID is missing. Cannot process invoice.' };
  }

  if (!file || file.size === 0) {
    return { error: 'No file uploaded or file is empty.' };
  }

  const supportedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    return { error: `Unsupported file type: ${file.type}. Please upload a PDF, JPG, PNG or WEBP file.` };
  }

  const maxSizeInBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeInBytes) {
    return { error: `File is too large (${(file.size / (1024*1024)).toFixed(2)}MB). Maximum size is 10MB.` };
  }
  
  try {
    const invoiceDataUri = await fileToDataUri(file);
    const extractedData: ExtractInvoiceDataOutput = await extractInvoiceData({ invoiceDataUri });

    if (!extractedData || !extractedData.vendor || typeof extractedData.total === 'undefined') {
        console.error('Extraction failed or returned incomplete data:', extractedData);
        return { error: 'Failed to extract key data from invoice. The document might not be a valid invoice or is unreadable by the AI.' };
    }
    
    const summaryInput = {
      vendor: extractedData.vendor,
      date: extractedData.date,
      total: extractedData.total,
      lineItems: extractedData.lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
      })),
    };
    const summarizedData: SummarizeInvoiceOutput = await summarizeInvoice(summaryInput);

    const { db } = await connectToDatabase();
    const invoiceDocumentForDb = {
      userId: new ObjectId(userIdString),
      fileName: file.name,
      vendor: extractedData.vendor,
      date: extractedData.date, // Storing as string from AI, consider converting to BSON Date if consistency is needed
      total: extractedData.total,
      lineItems: extractedData.lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
      })), // Ensure LineItem structure matches
      summary: summarizedData.summary,
      uploadedAt: new Date(), // BSON Date for upload timestamp
    };

    const insertResult = await db.collection(INVOICES_COLLECTION).insertOne(invoiceDocumentForDb);

    if (!insertResult.insertedId) {
      return { error: 'Failed to save invoice to the database.' };
    }

    const newInvoice: Invoice = {
      id: insertResult.insertedId.toHexString(), // Use MongoDB's _id as the invoice id
      userId: userIdString, 
      fileName: file.name,
      vendor: extractedData.vendor,
      date: extractedData.date, 
      total: extractedData.total,
      lineItems: extractedData.lineItems as LineItem[], // Cast to LineItem[]
      summary: summarizedData.summary,
      uploadedAt: invoiceDocumentForDb.uploadedAt.toISOString(), // Convert BSON Date to ISO string for client
    };
    
    return { invoice: newInvoice, message: `Successfully processed and saved ${file.name}.` };

  } catch (error: any) {
    console.error('Error processing invoice:', error);
    let errorMessage = 'An unexpected error occurred while processing the invoice.';
    if (error && typeof error.message === 'string') {
        errorMessage = error.message;
    }
    
    if (error.name === 'BSONError' && error.message.includes('input must be a 24 character hex string')) {
      errorMessage = 'Invalid User ID format for database operation.';
    } else if (errorMessage.includes('Deadline exceeded') || errorMessage.includes('unavailable')) {
        errorMessage = 'The AI service is currently unavailable or timed out. Please try again later.';
    } else if (errorMessage.includes('Invalid media type') || errorMessage.includes('Unsupported input content type')) {
        errorMessage = "The AI service could not process the file's format. Please ensure it's a clear PDF, JPG, or PNG.";
    } else if (errorMessage.includes('unparsable') || errorMessage.includes('malformed')) {
        errorMessage = 'The uploaded file appears to be corrupted or unreadable.';
    }


    return { error: errorMessage };
  }
}
