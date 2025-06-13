
'use server';

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { uploadFileToGCS } from '@/lib/gcs';
import { extractInvoiceData, type ExtractInvoiceDataOutput } from '@/ai/flows/extract-invoice-data';
import { summarizeInvoice, type SummarizeInvoiceOutput } from '@/ai/flows/summarize-invoice';
import { ai } from '@/ai/genkit';
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
  message?: string;
}

const INVOICES_COLLECTION = 'uploaded_invoices';
const ATLAS_VECTOR_SEARCH_INDEX_NAME = 'vector_index_summary'; // As configured in Atlas

// Utility function to map MongoDB document to Invoice type
function mapDocumentToInvoice(doc: any): Invoice {
  let uploadedAtISO: string;
  if (doc.uploadedAt instanceof Date) {
    uploadedAtISO = doc.uploadedAt.toISOString();
  } else if (typeof doc.uploadedAt === 'string') {
    const parsedDate = new Date(doc.uploadedAt);
    uploadedAtISO = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date(0).toISOString();
    if (isNaN(parsedDate.getTime())) console.warn(`Invalid uploadedAt date format for invoice ID ${doc._id}: ${doc.uploadedAt}`);
  } else {
    console.warn(`Missing or invalid uploadedAt for invoice ID ${doc._id}`);
    uploadedAtISO = new Date(0).toISOString();
  }

  let deletedAtISO: string | undefined = undefined;
  if (doc.deletedAt instanceof Date) {
    deletedAtISO = doc.deletedAt.toISOString();
  } else if (typeof doc.deletedAt === 'string') {
    const parsedDate = new Date(doc.deletedAt);
    deletedAtISO = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;
    if (isNaN(parsedDate.getTime())) console.warn(`Invalid deletedAt date format for invoice ID ${doc._id}: ${doc.deletedAt}`);
  } else if (doc.deletedAt) {
    console.warn(`Invalid deletedAt type for invoice ID ${doc._id}: ${typeof doc.deletedAt}`);
  }

  const lineItems: LineItem[] = Array.isArray(doc.lineItems) ? doc.lineItems.map((item: any) => ({
    description: item.description || 'N/A',
    amount: typeof item.amount === 'number' ? item.amount : 0,
  })) : [];
  if (!Array.isArray(doc.lineItems)) {
    console.warn(`lineItems is not an array for invoice ID ${doc._id}`);
  }

  return {
    id: doc._id.toHexString(),
    userId: doc.userId.toHexString(),
    fileName: doc.fileName || 'Unknown File',
    vendor: doc.vendor || 'Unknown Vendor',
    date: doc.date || 'Unknown Date',
    total: typeof doc.total === 'number' ? doc.total : 0,
    lineItems: lineItems,
    summary: doc.summary || 'No summary available.',
    summaryEmbedding: doc.summaryEmbedding as number[] | undefined,
    uploadedAt: uploadedAtISO,
    gcsFileUri: doc.gcsFileUri,
    isDeleted: !!doc.isDeleted,
    deletedAt: deletedAtISO,
  };
}


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
    return { error: `File is too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is 10MB.` };
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

    let summaryEmbedding: number[] | undefined = undefined;
    if (summarizedData.summary) {
      try {
        const embeddingResponse = await ai.embed({
          content: summarizedData.summary,
        });
        summaryEmbedding = embeddingResponse.embedding;
      } catch (embeddingError: any) {
        console.warn('Failed to generate summary embedding:', embeddingError.message);
      }
    }


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
      summaryEmbedding: summaryEmbedding,
      uploadedAt: new Date(),
      gcsFileUri: gcsFileUri,
      isDeleted: false,
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
      summaryEmbedding: summaryEmbedding,
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
    } else if (errorMessage.includes('GCS Upload Error') || (error.message && error.message.startsWith('GCS Upload Error'))) {
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
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (e) {
      console.error('Error creating ObjectId from userId in fetchUserInvoices:', userId, e);
      return { error: 'Invalid User ID format provided.' };
    }

    const invoiceDocuments = await db
      .collection(INVOICES_COLLECTION)
      .find({
        userId: userObjectId,
        isDeleted: { $ne: true }
      })
      .sort({ uploadedAt: -1 })
      .toArray();

    const invoices: Invoice[] = invoiceDocuments.map(mapDocumentToInvoice);
    return { invoices };

  } catch (error: any) {
    console.error('Error fetching invoices:', error.message, error.stack, error);
    let errorMessage = 'An unexpected error occurred while fetching invoices.';
    if (error.name === 'BSONError' && error.message.includes('input must be a 24 character hex string')) {
      errorMessage = 'Invalid User ID format for fetching invoices.';
    } else if (error.message) {
      errorMessage = `Failed to fetch invoices: ${error.message}`;
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
      return { error: 'Invoice was not modified. It might already be deleted.' };
    }

    return { success: true, deletedInvoiceId: invoiceId };
  } catch (error: any) {
    console.error('Error soft deleting invoice:', error.message, error.stack, error);
    let errorMessage = 'An unexpected error occurred while deleting the invoice.';
    if (error.name === 'BSONError') {
      errorMessage = 'Invalid ID format for invoice or user during delete.';
    } else if (error.message) {
      errorMessage = `Failed to delete invoice: ${error.message}`;
    }
    return { error: errorMessage };
  }
}


export interface FetchInvoiceByIdResponse {
  invoice?: Invoice;
  error?: string;
}

export async function fetchInvoiceById(invoiceId: string, userId: string): Promise<FetchInvoiceByIdResponse> {
  if (!userId) {
    return { error: 'User ID is required to fetch an invoice.' };
  }
  if (!invoiceId) {
    return { error: 'Invoice ID is required to fetch an invoice.' };
  }

  try {
    const { db } = await connectToDatabase();
    let userObjectId;
    let invoiceObjectId;

    try {
      userObjectId = new ObjectId(userId);
      invoiceObjectId = new ObjectId(invoiceId);
    } catch (e) {
      console.error('Error creating ObjectId in fetchInvoiceById:', e);
      return { error: 'Invalid User ID or Invoice ID format provided.' };
    }

    const doc = await db.collection(INVOICES_COLLECTION).findOne({
      _id: invoiceObjectId,
      userId: userObjectId,
      isDeleted: { $ne: true }
    });

    if (!doc) {
      return { error: 'Invoice not found or you do not have permission to view it.' };
    }
    
    const invoice = mapDocumentToInvoice(doc);
    return { invoice };

  } catch (error: any) {
    console.error(`Error fetching invoice by ID (${invoiceId}):`, error.message, error.stack, error);
    let errorMessage = 'An unexpected error occurred while fetching the invoice details.';
    if (error.name === 'BSONError') {
      errorMessage = 'Invalid ID format for fetching the invoice.';
    } else if (error.message) {
      errorMessage = `Failed to fetch invoice details: ${error.message}`;
    }
    return { error: errorMessage };
  }
}

export interface SearchInvoicesResponse {
  invoices?: Invoice[];
  error?: string;
}

export async function searchInvoices(userId: string, searchText: string): Promise<SearchInvoicesResponse> {
  if (!userId) {
    return { error: 'User ID is required to search invoices.' };
  }
  if (!searchText || searchText.trim() === '') {
    // If search text is empty, return all user invoices (similar to fetchUserInvoices)
    return fetchUserInvoices(userId);
  }

  try {
    const { db } = await connectToDatabase();
    let userObjectId;
    try {
      userObjectId = new ObjectId(userId);
    } catch (e) {
      return { error: 'Invalid User ID format.' };
    }

    const queryEmbeddingResponse = await ai.embed({ content: searchText });
    const queryVector = queryEmbeddingResponse.embedding;

    if (!queryVector) {
      return { error: 'Failed to generate embedding for search query.' };
    }
    
    const pipeline = [
      {
        $vectorSearch: {
          index: ATLAS_VECTOR_SEARCH_INDEX_NAME,
          path: 'summaryEmbedding',
          queryVector: queryVector,
          numCandidates: 100, // Number of candidates to consider
          limit: 10, // Number of results to return
          filter: {
            userId: userObjectId,
            isDeleted: { $ne: true },
          },
        },
      },
      // Optionally, add a $project stage if you need to reshape the document
      // or ensure all fields match the Invoice type perfectly if $vectorSearch alters structure.
      // For now, we assume $vectorSearch returns documents compatible with mapDocumentToInvoice
    ];

    const searchedDocuments = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    
    const invoices: Invoice[] = searchedDocuments.map(mapDocumentToInvoice);
    
    return { invoices };

  } catch (error: any) {
    console.error('Error searching invoices:', error);
    let errorMessage = 'An unexpected error occurred during search.';
    if (error.message) {
        errorMessage = `Search failed: ${error.message}`;
    }
    if (error.toString().includes('index not found') || error.toString().includes(ATLAS_VECTOR_SEARCH_INDEX_NAME)) {
        errorMessage = `Search failed: The required vector search index "${ATLAS_VECTOR_SEARCH_INDEX_NAME}" may not exist or is not configured correctly in MongoDB Atlas.`;
    }
    return { error: errorMessage };
  }
}
