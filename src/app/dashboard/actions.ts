
'use server';

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '@/lib/mongodb';
import { uploadFileToGCS } from '@/lib/gcs';
import { extractInvoiceData, type ExtractInvoiceDataOutput } from '@/ai/flows/extract-invoice-data';
import { summarizeInvoice, type SummarizeInvoiceInput, type SummarizeInvoiceOutput } from '@/ai/flows/summarize-invoice';
import { categorizeInvoice, type CategorizeInvoiceInput, type CategorizeInvoiceOutput } from '@/ai/flows/categorize-invoice-flow';
import { detectRecurrence, type DetectRecurrenceInput, type DetectRecurrenceOutput } from '@/ai/flows/detect-recurrence-flow';
import { ai } from '@/ai/genkit';
import type { Invoice, LineItem } from '@/types/invoice';
import { ManualInvoiceEntrySchema, type ManualInvoiceEntryData } from '@/types/invoice-form';


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
  // Ensure doc is an object
  if (!doc || typeof doc !== 'object' || doc === null) {
    console.warn('mapDocumentToInvoice received a non-object or null document:', doc);
    const errorId = new ObjectId().toHexString();
    return {
      id: errorId,
      userId: 'ERROR_INVALID_DOC_USER',
      fileName: 'Invalid Document',
      vendor: 'N/A',
      date: new Date(0).toISOString(),
      total: 0,
      lineItems: [],
      summary: `Error: Could not process document data for ID ${errorId}.`,
      uploadedAt: new Date(0).toISOString(),
      isDeleted: true,
    };
  }

  let id: string;
  if (doc._id && typeof doc._id.toHexString === 'function') {
    id = doc._id.toHexString();
  } else if (doc._id && typeof doc._id === 'string') {
    id = doc._id;
  } else {
    console.warn(`Invalid or missing _id for document:`, JSON.stringify(doc));
    id = new ObjectId().toHexString(); // Fallback to a new ObjectId string
  }

  let userId: string;
  if (doc.userId && typeof doc.userId.toHexString === 'function') {
    userId = doc.userId.toHexString();
  } else if (doc.userId && typeof doc.userId === 'string') {
    userId = doc.userId;
  } else {
    console.warn(`Invalid or missing userId for document ID ${id}:`, doc.userId);
    userId = 'UNKNOWN_USER';
  }

  let uploadedAtISO: string;
  if (doc.uploadedAt instanceof Date) {
    uploadedAtISO = doc.uploadedAt.toISOString();
  } else if (typeof doc.uploadedAt === 'string') {
    const parsedDate = new Date(doc.uploadedAt);
    uploadedAtISO = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date(0).toISOString();
    if (isNaN(parsedDate.getTime())) console.warn(`Invalid uploadedAt date format for invoice ID ${id}: ${doc.uploadedAt}`);
  } else {
    console.warn(`Missing or invalid uploadedAt for invoice ID ${id}, type: ${typeof doc.uploadedAt}`);
    uploadedAtISO = new Date(0).toISOString();
  }

  let deletedAtISO: string | undefined = undefined;
  if (doc.deletedAt instanceof Date) {
    deletedAtISO = doc.deletedAt.toISOString();
  } else if (typeof doc.deletedAt === 'string') {
    const parsedDate = new Date(doc.deletedAt);
    deletedAtISO = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : undefined;
    if (isNaN(parsedDate.getTime())) console.warn(`Invalid deletedAt date format for invoice ID ${id}: ${doc.deletedAt}`);
  } else if (doc.deletedAt !== null && doc.deletedAt !== undefined) {
    console.warn(`Invalid deletedAt type for invoice ID ${id}: ${typeof doc.deletedAt}`);
  }

  const lineItems: LineItem[] = Array.isArray(doc.lineItems) ? doc.lineItems.map((item: any) => ({
    description: (item && typeof item.description === 'string') ? item.description : 'N/A',
    amount: (item && typeof item.amount === 'number') ? item.amount : 0,
  })) : [];
  if (!Array.isArray(doc.lineItems) && doc.lineItems !== undefined && doc.lineItems !== null) {
    console.warn(`lineItems is not an array for invoice ID ${id}:`, doc.lineItems);
  }
  
  const categories: string[] | undefined = Array.isArray(doc.categories) 
    ? doc.categories.filter((cat: any) => typeof cat === 'string') 
    : undefined;
  if (doc.categories !== undefined && !Array.isArray(doc.categories)) {
      console.warn(`categories is not an array for invoice ID ${id}:`, doc.categories);
  }

  const isLikelyRecurring: boolean | undefined = typeof doc.isLikelyRecurring === 'boolean' ? doc.isLikelyRecurring : undefined;
  const recurrenceReasoning: string | undefined = typeof doc.recurrenceReasoning === 'string' ? doc.recurrenceReasoning : undefined;


  return {
    id,
    userId,
    fileName: typeof doc.fileName === 'string' ? doc.fileName : 'Unknown File',
    vendor: typeof doc.vendor === 'string' ? doc.vendor : 'Unknown Vendor',
    date: typeof doc.date === 'string' ? doc.date : 'Unknown Date',
    total: typeof doc.total === 'number' ? doc.total : 0,
    lineItems: lineItems,
    summary: typeof doc.summary === 'string' ? doc.summary : 'No summary available.',
    summaryEmbedding: Array.isArray(doc.summaryEmbedding) && doc.summaryEmbedding.every(num => typeof num === 'number') ? doc.summaryEmbedding as number[] : undefined,
    categories: categories,
    isLikelyRecurring: isLikelyRecurring,
    recurrenceReasoning: recurrenceReasoning,
    uploadedAt: uploadedAtISO,
    gcsFileUri: typeof doc.gcsFileUri === 'string' ? doc.gcsFileUri : undefined,
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

    const summaryInput: SummarizeInvoiceInput = {
      vendor: extractedData.vendor,
      date: extractedData.date,
      total: extractedData.total,
      lineItems: extractedData.lineItems.map(item => ({
        description: item.description,
        amount: item.amount,
      })),
    };
    const summarizedData: SummarizeInvoiceOutput = await summarizeInvoice(summaryInput);

    let categories: string[] = ["Uncategorized"];
    try {
        const categorizationInput: CategorizeInvoiceInput = {
            vendor: extractedData.vendor,
            lineItems: extractedData.lineItems.map(item => ({ description: item.description, amount: item.amount})),
        };
        const categorizationOutput: CategorizeInvoiceOutput = await categorizeInvoice(categorizationInput);
        if (categorizationOutput && categorizationOutput.categories && categorizationOutput.categories.length > 0) {
            categories = categorizationOutput.categories;
        }
    } catch (catError: any) {
        console.warn('Failed to categorize invoice:', catError.message);
    }

    let recurrenceInfo: DetectRecurrenceOutput = { isLikelyRecurring: false };
    try {
        const recurrenceInput: DetectRecurrenceInput = {
            vendor: extractedData.vendor,
            lineItems: extractedData.lineItems.map(item => ({ description: item.description, amount: item.amount })),
        };
        recurrenceInfo = await detectRecurrence(recurrenceInput);
    } catch (recError: any) {
        console.warn('Failed to detect recurrence for invoice:', recError.message);
    }


    let summaryEmbedding: number[] | undefined = undefined;
    if (summarizedData.summary) {
      try {
        const embeddingResponse = await ai.embed({
          content: summarizedData.summary,
        });
        if (embeddingResponse && embeddingResponse.embedding && Array.isArray(embeddingResponse.embedding)) {
          summaryEmbedding = embeddingResponse.embedding;
        } else {
          console.warn('Failed to generate summary embedding: Embedding response was invalid or missing embedding array.', embeddingResponse);
        }
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
      categories: categories,
      isLikelyRecurring: recurrenceInfo.isLikelyRecurring,
      recurrenceReasoning: recurrenceInfo.reasoning,
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
      categories: categories,
      isLikelyRecurring: recurrenceInfo.isLikelyRecurring,
      recurrenceReasoning: recurrenceInfo.reasoning,
      uploadedAt: invoiceDocumentForDb.uploadedAt.toISOString(),
      gcsFileUri: gcsFileUri,
      isDeleted: false,
    };

    return {
      invoice: newInvoice,
      message: `Successfully processed ${file.name}. Data saved, categorized, and file stored.`
    };

  } catch (error: any)
{
    console.error('Error processing invoice:', error);
    let errorMessage = 'An unexpected error occurred while processing the invoice.';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }


    if (error?.name === 'BSONError' && error?.message?.includes('input must be a 24 character hex string')) {
      errorMessage = 'Invalid User ID format for database operation.';
    } else if (errorMessage.includes('Deadline exceeded') || errorMessage.includes('unavailable')) {
      errorMessage = 'The AI service is currently unavailable or timed out. Please try again later.';
    } else if (errorMessage.includes('Invalid media type') || errorMessage.includes('Unsupported input content type')) {
      errorMessage = "The AI service could not process the file's format. Please ensure it's a clear PDF, JPG, or PNG.";
    } else if (errorMessage.includes('unparsable') || errorMessage.includes('malformed')) {
      errorMessage = 'The uploaded file appears to be corrupted or unreadable.';
    } else if (errorMessage.includes('GCS Upload Error') || (error?.message && error?.message.startsWith('GCS Upload Error'))) {
      errorMessage = `Failed to store invoice file in Cloud Storage: ${error.message.replace('GCS UploadError: ', '')}`;
    }

    return { error: errorMessage };
  }
}


export interface ManualInvoiceFormState {
    invoice?: Invoice;
    error?: string;
    message?: string;
    errors?: Partial<Record<keyof ManualInvoiceEntryData | `lineItems.${number}.description` | `lineItems.${number}.amount` | 'isMonthlyRecurring', string[]>>;
}


export async function handleManualInvoiceEntry(
  prevState: ManualInvoiceFormState | undefined,
  formData: FormData
): Promise<ManualInvoiceFormState> {

  const rawFormData = {
    userId: formData.get('userId') as string,
    vendor: formData.get('vendor') as string,
    date: formData.get('invoiceDate') as string, 
    total: formData.get('total') as string,
    lineItems: [] as { description: string; amount: string }[],
    isMonthlyRecurring: formData.get('isMonthlyRecurring') === 'true',
  };

  let i = 0;
  while (formData.has(`lineItems[${i}].description`)) {
    rawFormData.lineItems.push({
      description: formData.get(`lineItems[${i}].description`) as string,
      amount: formData.get(`lineItems[${i}].amount`) as string, 
    });
    i++;
  }
  
  const validatedFields = ManualInvoiceEntrySchema.safeParse({
    userId: rawFormData.userId,
    vendor: rawFormData.vendor,
    date: rawFormData.date,
    total: parseFloat(rawFormData.total), 
    lineItems: rawFormData.lineItems.map(li => ({
        description: li.description,
        amount: parseFloat(li.amount) 
    })),
    isMonthlyRecurring: rawFormData.isMonthlyRecurring,
  });

  if (!validatedFields.success) {
    const fieldErrors: ManualInvoiceFormState['errors'] = {};
    for (const issue of validatedFields.error.issues) {
      const path = issue.path.join('.') as keyof ManualInvoiceFormState['errors'];
      if (!fieldErrors[path]) {
        fieldErrors[path] = [];
      }
      fieldErrors[path]!.push(issue.message);
    }
    return {
      error: "Validation failed. Please check the fields.",
      errors: fieldErrors,
    };
  }

  const { userId, vendor, date, total, lineItems, isMonthlyRecurring } = validatedFields.data;

  try {
    const summaryInput: SummarizeInvoiceInput = { vendor, date, total, lineItems };
    const summarizedData = await summarizeInvoice(summaryInput);

    let categories: string[] = ["Uncategorized"];
    try {
      const categorizationInput: CategorizeInvoiceInput = { vendor, lineItems };
      const categorizationOutput = await categorizeInvoice(categorizationInput);
      if (categorizationOutput?.categories?.length) {
        categories = categorizationOutput.categories;
      }
    } catch (catError: any) {
      console.warn('Failed to categorize manual invoice:', catError.message);
    }

    let recurrenceInfo: DetectRecurrenceOutput = { isLikelyRecurring: false };
    if (isMonthlyRecurring) {
        recurrenceInfo = {
            isLikelyRecurring: true,
            reasoning: "User marked as monthly recurring."
        };
    } else {
        try {
            const recurrenceInput: DetectRecurrenceInput = { vendor, lineItems };
            recurrenceInfo = await detectRecurrence(recurrenceInput);
        } catch (recError: any) {
            console.warn('Failed to detect recurrence for manual invoice:', recError.message);
            // Keep default recurrenceInfo if AI detection fails
        }
    }


    let summaryEmbedding: number[] | undefined = undefined;
    if (summarizedData.summary) {
      try {
        const embeddingResponse = await ai.embed({ content: summarizedData.summary });
        if (embeddingResponse?.embedding?.length) {
          summaryEmbedding = embeddingResponse.embedding;
        } else {
          console.warn('Failed to generate summary embedding for manual invoice.');
        }
      } catch (embeddingError: any) {
        console.warn('Failed to generate summary embedding for manual invoice:', embeddingError.message);
      }
    }

    const formattedDate = new Date(date).toISOString().split('T')[0];
    const fileName = `Manual - ${vendor} - ${formattedDate}.json`; 

    const { db } = await connectToDatabase();
    const invoiceDocumentForDb = {
      userId: new ObjectId(userId),
      fileName,
      vendor,
      date, 
      total,
      lineItems,
      summary: summarizedData.summary,
      summaryEmbedding,
      categories,
      isLikelyRecurring: recurrenceInfo.isLikelyRecurring,
      recurrenceReasoning: recurrenceInfo.reasoning,
      uploadedAt: new Date(),
      gcsFileUri: undefined, 
      isDeleted: false,
      deletedAt: null,
    };

    const insertResult = await db.collection(INVOICES_COLLECTION).insertOne(invoiceDocumentForDb);
    if (!insertResult.insertedId) {
      return { error: 'Failed to save manual invoice to the database.' };
    }

    const newInvoice: Invoice = mapDocumentToInvoice({
        _id: insertResult.insertedId, 
        ...invoiceDocumentForDb 
    });

    return {
      invoice: newInvoice,
      message: `Successfully added manual invoice for ${vendor}.`
    };

  } catch (error: any) {
    console.error('Error processing manual invoice entry:', error);
    let errorMessage = 'An unexpected error occurred while processing the manual invoice.';
    if (error instanceof Error) errorMessage = error.message;
    else if (typeof error === 'string') errorMessage = error;
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
    console.error('Error fetching invoices:', error);
    let errorMessage = 'An unexpected error occurred while fetching invoices.';
     if (error instanceof Error) {
      errorMessage = `Failed to fetch invoices: ${error.message}`;
      if (error.name === 'BSONError' && error.message.includes('input must be a 24 character hex string')) {
        errorMessage = 'Invalid User ID format for fetching invoices.';
      }
    } else if (typeof error === 'string') {
      errorMessage = `Failed to fetch invoices: ${error}`;
    } else if (error && typeof error.toString === 'function') {
        errorMessage = `Failed to fetch invoices: ${error.toString()}`;
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
    console.error('Error soft deleting invoice:', error);
    let errorMessage = 'An unexpected error occurred while deleting the invoice.';
    if (error instanceof Error) {
      errorMessage = `Failed to delete invoice: ${error.message}`;
      if (error.name === 'BSONError') {
        errorMessage = 'Invalid ID format for invoice or user during delete.';
      }
    } else if (typeof error === 'string') {
      errorMessage = `Failed to delete invoice: ${error}`;
    } else if (error && typeof error.toString === 'function') {
        errorMessage = `Failed to delete invoice: ${error.toString()}`;
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
    console.error(`Error fetching invoice by ID (${invoiceId}):`, error);
    let errorMessage = 'An unexpected error occurred while fetching the invoice details.';
    if (error instanceof Error) {
      errorMessage = `Failed to fetch invoice details: ${error.message}`;
      if (error.name === 'BSONError') {
        errorMessage = 'Invalid ID format for fetching the invoice.';
      }
    } else if (typeof error === 'string') {
      errorMessage = `Failed to fetch invoice details: ${error}`;
    } else if (error && typeof error.toString === 'function') {
        errorMessage = `Failed to fetch invoice details: ${error.toString()}`;
    }
    return { error: errorMessage };
  }
}

export interface SearchInvoicesResponse {
  invoices?: Invoice[];
  error?: string;
}

export async function searchInvoices(userId: string, searchText: string): Promise<SearchInvoicesResponse> {
  console.error('Raw error object during searchInvoices:', "searchInvoices called"); 
  if (!userId) {
    return { error: 'User ID is required to search invoices.' };
  }
  if (!searchText || searchText.trim() === '') {
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
    
    if (!queryEmbeddingResponse || !queryEmbeddingResponse.embedding || !Array.isArray(queryEmbeddingResponse.embedding)) {
      console.error('Failed to generate embedding for search query. AI response:', queryEmbeddingResponse);
      return { error: 'Failed to generate embedding for search query. The AI service might be unavailable or the query is invalid.' };
    }
    const queryVector = queryEmbeddingResponse.embedding;
    
    const pipeline = [
      {
        $vectorSearch: {
          index: ATLAS_VECTOR_SEARCH_INDEX_NAME,
          path: 'summaryEmbedding',
          queryVector: queryVector,
          numCandidates: 100, 
          limit: 10, 
          filter: {
            userId: userObjectId,
            isDeleted: { $ne: true },
            summaryEmbedding: { $exists: true, $type: "array" }
          },
        },
      },
    ];

    const searchedDocuments = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    
    const invoices: Invoice[] = searchedDocuments.map(mapDocumentToInvoice);
    
    return { invoices };

  } catch (error: any) {
    console.error('Raw error object during searchInvoices:', error); 

    let errorMessage = 'An unexpected error occurred during search.'; 

    if (error) { 
      if (typeof error === 'string') {
          errorMessage = error;
      } else if (error.message && typeof error.message === 'string') {
          errorMessage = error.message;
          
          if (errorMessage.toLowerCase().includes('index not found') || errorMessage.toLowerCase().includes(ATLAS_VECTOR_SEARCH_INDEX_NAME.toLowerCase())) {
              errorMessage = `The required vector search index "${ATLAS_VECTOR_SEARCH_INDEX_NAME}" may not exist or is not configured correctly. Please also ensure that documents have the 'summaryEmbedding' field and it's an array of numbers.`;
          } else if (errorMessage.toLowerCase().includes('queryvector parameter must be an array of numbers')) {
              errorMessage = 'The generated query for search was invalid. Please try rephrasing your search.';
          } else if (errorMessage.toLowerCase().includes('summaryembedding field must be an array type')) {
              errorMessage = `One or more invoices has an invalid 'summaryEmbedding'. It should be an array of numbers. Check your data or re-upload affected invoices. Index name: ${ATLAS_VECTOR_SEARCH_INDEX_NAME}`;
          }
      } else if (error.toString && typeof error.toString === 'function') {
          errorMessage = error.toString();
      }
    }
    
    const knownErrorMessages = [
        `the required vector search index "${ATLAS_VECTOR_SEARCH_INDEX_NAME.toLowerCase()}"`,
        `the generated query for search was invalid`,
        `one or more invoices has an invalid 'summaryembedding'`
    ];

    let isKnownError = false;
    const lowerErrorMessage = errorMessage.toLowerCase();
    for (const knownMsg of knownErrorMessages) {
        if (lowerErrorMessage.includes(knownMsg)) {
            isKnownError = true;
            break;
        }
    }

    if (!isKnownError && !lowerErrorMessage.startsWith('search failed:')) {
        errorMessage = `Search failed: ${errorMessage}`;
    }
    
    return { error: errorMessage };
  }
}

export interface FindSimilarInvoicesResponse {
  similarInvoices?: Invoice[];
  error?: string;
}

export async function findSimilarInvoices(currentInvoiceId: string, userId: string): Promise<FindSimilarInvoicesResponse> {
  if (!userId) {
    return { error: 'User ID is required to find similar invoices.' };
  }
  if (!currentInvoiceId) {
    return { error: 'Current Invoice ID is required to find similar invoices.' };
  }

  let currentInvoiceObjectId: ObjectId;
  let userObjectId: ObjectId;

  try {
    currentInvoiceObjectId = new ObjectId(currentInvoiceId);
    userObjectId = new ObjectId(userId);
  } catch (e) {
    return { error: 'Invalid Invoice ID or User ID format.' };
  }

  try {
    const { db } = await connectToDatabase();

    // 1. Fetch the current invoice to get its embedding
    const currentInvoiceDoc = await db.collection(INVOICES_COLLECTION).findOne({
      _id: currentInvoiceObjectId,
      userId: userObjectId,
      isDeleted: { $ne: true },
      summaryEmbedding: { $exists: true, $type: 'array' } 
    });

    if (!currentInvoiceDoc) {
      return { error: 'Current invoice not found, does not have an embedding, or you do not have permission.' };
    }
    
    const currentInvoice = mapDocumentToInvoice(currentInvoiceDoc);
    if (!currentInvoice.summaryEmbedding || currentInvoice.summaryEmbedding.length === 0) {
        return { error: 'Current invoice does not have a summary embedding to compare against.' };
    }
    const queryVector = currentInvoice.summaryEmbedding;

    // 2. Perform vector search for similar invoices
    const pipeline = [
      {
        $vectorSearch: {
          index: ATLAS_VECTOR_SEARCH_INDEX_NAME,
          path: 'summaryEmbedding',
          queryVector: queryVector,
          numCandidates: 50, 
          limit: 6, 
          filter: {
            userId: userObjectId,
            isDeleted: { $ne: true },
            summaryEmbedding: { $exists: true, $type: 'array' },
          },
        },
      },
      { 
        $match: {
            _id: { $ne: currentInvoiceObjectId }
        }
      },
      { 
          $limit: 5 
      }
    ];

    const similarDocuments = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    const similarInvoices: Invoice[] = similarDocuments.map(mapDocumentToInvoice);
    
    return { similarInvoices };

  } catch (error: any) {
    console.error('Raw error object during findSimilarInvoices:', error);
    let errorMessage = 'An unexpected error occurred while finding similar invoices.';
    if (error) {
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message && typeof error.message === 'string') {
        errorMessage = error.message;
         if (errorMessage.toLowerCase().includes('index not found') || errorMessage.toLowerCase().includes(ATLAS_VECTOR_SEARCH_INDEX_NAME.toLowerCase())) {
              errorMessage = `The vector search index "${ATLAS_VECTOR_SEARCH_INDEX_NAME}" may be misconfigured or not found for similar invoice search.`;
          }
      } else if (error.toString && typeof error.toString === 'function') {
        errorMessage = error.toString();
      }
    }
     if (!errorMessage.toLowerCase().startsWith('failed to find similar invoices:')) {
        errorMessage = `Failed to find similar invoices: ${errorMessage}`;
    }
    return { error: errorMessage };
  }
}

export interface SpendingByCategory {
  category: string;
  totalSpent: number;
}

export interface FetchSpendingDistributionResponse {
  data?: SpendingByCategory[];
  error?: string;
}

export async function fetchSpendingDistribution(userId: string): Promise<FetchSpendingDistributionResponse> {
  if (!userId) {
    return { error: 'User ID is required to fetch spending distribution.' };
  }

  try {
    const { db } = await connectToDatabase();
    const userObjectId = new ObjectId(userId);

    const pipeline = [
      {
        $match: {
          userId: userObjectId,
          isDeleted: { $ne: true },
          categories: { $exists: true, $ne: [] } 
        }
      },
      {
        $unwind: '$categories' 
      },
      {
        $group: {
          _id: '$categories', 
          totalSpent: { $sum: '$total' } 
        }
      },
      {
        $project: {
          _id: 0, 
          category: '$_id', 
          totalSpent: 1
        }
      },
      {
        $sort: { totalSpent: -1 } 
      }
    ];

    const result = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    
    const data: SpendingByCategory[] = result.map(item => ({
        category: item.category as string,
        totalSpent: item.totalSpent as number,
    }));

    return { data };

  } catch (error: any) {
    console.error('Error fetching spending distribution:', error);
    let errorMessage = 'An unexpected error occurred while fetching spending distribution.';
    if (error instanceof Error) {
      errorMessage = `Failed to fetch spending distribution: ${error.message}`;
      if (error.name === 'BSONError') {
        errorMessage = 'Invalid User ID format for fetching spending distribution.';
      }
    } else if (typeof error === 'string') {
      errorMessage = `Failed to fetch spending distribution: ${error}`;
    }
    return { error: errorMessage };
  }
}
