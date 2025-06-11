
'use server';

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { uploadFileToGCS } from '@/lib/gcs'; // Import GCS upload function
import { extractInvoiceData, type ExtractInvoiceDataOutput } from '@/ai/flows/extract-invoice-data';
import { summarizeInvoice, type SummarizeInvoiceOutput } from '@/ai/flows/summarize-invoice';
import type { Invoice, LineItem } from '@/types/invoice';

// Helper to convert File object to data URI and Buffer
interface FileConversionResult {
  dataUri: string;
  buffer: Buffer;
}
async function prepareFileData(file: File): Promise<FileConversionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64String = buffer.toString('base64');
  const dataUri = `data:${file.type};base64,${base64String}`;
  return { dataUri, buffer };
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
  
  let fileData: FileConversionResult;
  let gcsFileUri: string | undefined = undefined;

  try {
    fileData = await prepareFileData(file);
    const extractedData: ExtractInvoiceDataOutput = await extractInvoiceData({ invoiceDataUri: fileData.dataUri });

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

    // Upload original file to GCS
    const uniqueFileIdForGCS = new ObjectId().toHexString();
    const gcsDestinationPath = `invoices/${userIdString}/${uniqueFileIdForGCS}_${file.name}`;
    gcsFileUri = await uploadFileToGCS(fileData.buffer, gcsDestinationPath, file.type);


    const { db } = await connectToDatabase();
    const invoiceDocumentForDb = {
      userId: new ObjectId(userIdString),
      fileName: file.name,
      vendor: extractedData.vendor,
      date: extractedData.date, 
      total: extractedData.total,
      lineItems: extractedData.lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
      })), 
      summary: summarizedData.summary,
      uploadedAt: new Date(), 
      gcsFileUri: gcsFileUri,
      isDeleted: false, // Initialize as not deleted
      deletedAt: null,
    };

    const insertResult = await db.collection(INVOICES_COLLECTION).insertOne(invoiceDocumentForDb);

    if (!insertResult.insertedId) {
      return { error: 'Failed to save invoice to the database.' };
    }

    const newInvoice: Invoice = {
      id: insertResult.insertedId.toHexString(), 
      userId: userIdString, 
      fileName: file.name,
      vendor: extractedData.vendor,
      date: extractedData.date, 
      total: extractedData.total,
      lineItems: extractedData.lineItems as LineItem[], 
      summary: summarizedData.summary,
      uploadedAt: invoiceDocumentForDb.uploadedAt.toISOString(),
      gcsFileUri: gcsFileUri, 
      isDeleted: false,
    };
    
    return { 
        invoice: newInvoice, 
        message: `Successfully processed ${file.name}. Data saved and file stored in Cloud Storage.` 
    };

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
    } else if (errorMessage.includes('GCS Upload Error')) {
        errorMessage = `Failed to store invoice file in Cloud Storage: ${error.message.replace('GCS Upload Error: ', '')}`;
    }

    return { error: errorMessage };
  }
}


export interface FetchInvoicesResponse {
  invoices?: Invoice[];
  error?: string;
}

export async function fetchUserInvoices(userId: string): Promise<FetchInvoicesResponse> {
  if (!userId) {
    return { error: 'User ID is required to fetch invoices.' };
  }

  try {
    const { db } = await connectToDatabase();
    const userObjectId = new ObjectId(userId);

    const invoiceDocuments = await db
      .collection(INVOICES_COLLECTION)
      .find({ 
        userId: userObjectId,
        isDeleted: { $ne: true } // Only fetch non-deleted invoices
      })
      .sort({ uploadedAt: -1 }) 
      .toArray();

    if (!invoiceDocuments) { 
      return { invoices: [] };
    }

    const invoices: Invoice[] = invoiceDocuments.map((doc) => ({
      id: doc._id.toHexString(),
      userId: doc.userId.toHexString(),
      fileName: doc.fileName,
      vendor: doc.vendor,
      date: doc.date, 
      total: doc.total,
      lineItems: doc.lineItems.map((item: any) => ({ 
        description: item.description,
        amount: item.amount,
      })) as LineItem[],
      summary: doc.summary,
      uploadedAt: doc.uploadedAt.toISOString(), 
      gcsFileUri: doc.gcsFileUri,
      isDeleted: doc.isDeleted,
      deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : undefined,
    }));

    return { invoices };
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    let errorMessage = 'An unexpected error occurred while fetching invoices.';
    if (error.name === 'BSONError' && error.message.includes('input must be a 24 character hex string')) {
      errorMessage = 'Invalid User ID format for fetching invoices.';
    }
    return { error: errorMessage };
  }
}

export interface SoftDeleteResponse {
  success?: boolean;
  error?: string;
  deletedInvoiceId?: string;
}

export async function softDeleteInvoice(invoiceId: string, userId: string): Promise<SoftDeleteResponse> {
  if (!userId) {
    return { error: 'User ID is required to delete an invoice.' };
  }
  if (!invoiceId) {
    return { error: 'Invoice ID is required to delete an invoice.' };
  }

  try {
    const { db } = await connectToDatabase();
    const userObjectId = new ObjectId(userId);
    const invoiceObjectId = new ObjectId(invoiceId);

    const result = await db.collection(INVOICES_COLLECTION).updateOne(
      { _id: invoiceObjectId, userId: userObjectId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return { error: 'Invoice not found or user not authorized to delete.' };
    }
    if (result.modifiedCount === 0) {
      // This might happen if the invoice was already marked as deleted
      return { error: 'Invoice was not modified. It might already be deleted.' };
    }

    return { success: true, deletedInvoiceId: invoiceId };
  } catch (error: any) {
    console.error('Error soft deleting invoice:', error);
    let errorMessage = 'An unexpected error occurred while deleting the invoice.';
     if (error.name === 'BSONError' && (error.message.includes('invoiceId') || error.message.includes('userId'))) {
      errorMessage = 'Invalid ID format for invoice or user.';
    }
    return { error: errorMessage };
  }
}
