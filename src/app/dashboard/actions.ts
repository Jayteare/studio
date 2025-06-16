
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
import { format as formatDateFn, parseISO, isValid, parse as parseDateFns } from 'date-fns';


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


// Helper to standardize date strings to YYYY-MM-DD
function standardizeDateString(dateInput?: string): string {
  const defaultDate = formatDateFn(new Date(), 'yyyy-MM-dd');
  if (!dateInput || typeof dateInput !== 'string') {
    console.warn('standardizeDateString: Received invalid or empty dateInput, defaulting to today.');
    return defaultDate;
  }

  // 1. Check if already in YYYY-MM-DD and valid
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    // Use UTC to avoid timezone shifts affecting the date components during validation
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return dateInput;
    }
  }

  // 2. Try parseISO for full ISO strings (e.g., with timezones)
  try {
    const isoParsedDate = parseISO(dateInput);
    if (isValid(isoParsedDate)) {
      return formatDateFn(isoParsedDate, 'yyyy-MM-dd');
    }
  } catch (e) { /* ignore, try other methods */ }

  // 3. Try common formats
  const commonFormats = [
    'MM/dd/yyyy', 'M/d/yyyy', 'MM-dd-yyyy', 'M-d-yyyy',
    'MM/dd/yy', 'M/d/yy',
    'MMMM d, yyyy', 'MMM d, yyyy', 'MMMM do, yyyy', 'MMM do, yyyy'
  ];
  for (const fmt of commonFormats) {
    try {
      const parsed = parseDateFns(dateInput, fmt, new Date()); // Using current date as reference
      if (isValid(parsed)) {
        return formatDateFn(parsed, 'yyyy-MM-dd');
      }
    } catch (e) { /* try next format */ }
  }

  // 4. If it's a timestamp (milliseconds since epoch)
  if (/^\d+$/.test(dateInput)) {
      const numDate = parseInt(dateInput, 10);
      if (numDate > 0) { 
          const d = new Date(numDate);
          if (isValid(d) && d.getFullYear() > 1900) { // Basic sanity check for year
              return formatDateFn(d, 'yyyy-MM-dd');
          }
      }
  }
  
  console.warn(`standardizeDateString: Could not parse date string "${dateInput}" into YYYY-MM-DD. Defaulting to today. Review AI date extraction or input source.`);
  return defaultDate;
}


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
      date: standardizeDateString(new Date(0).toISOString()), 
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
  
  const fileName = (typeof doc.fileName === 'string' && doc.fileName) ? doc.fileName : 'Unknown File';
  const vendor = (typeof doc.vendor === 'string' && doc.vendor) ? doc.vendor : 'Unknown Vendor';
  const date = (typeof doc.date === 'string' && doc.date) ? doc.date : standardizeDateString(new Date(0).toISOString());
  const total = typeof doc.total === 'number' ? doc.total : 0;
  const summary = (typeof doc.summary === 'string' && doc.summary) ? doc.summary : 'No summary available.';
  const gcsFileUri = typeof doc.gcsFileUri === 'string' ? doc.gcsFileUri : undefined;
  const isDeleted = typeof doc.isDeleted === 'boolean' ? doc.isDeleted : false;
  
  const recurrenceReasoning = typeof doc.recurrenceReasoning === 'string' ? doc.recurrenceReasoning : undefined;
  const isLikelyRecurring = typeof doc.isLikelyRecurring === 'boolean' ? doc.isLikelyRecurring : undefined;


  let uploadedAtISO: string;
  if (doc.uploadedAt instanceof Date && !isNaN(doc.uploadedAt.getTime())) {
      uploadedAtISO = doc.uploadedAt.toISOString();
  } else if (typeof doc.uploadedAt === 'string') {
      const parsedDate = parseISO(doc.uploadedAt);
      if (isValid(parsedDate)) {
          uploadedAtISO = parsedDate.toISOString();
      } else {
          const directParsed = new Date(doc.uploadedAt);
          if (isValid(directParsed)) {
            uploadedAtISO = directParsed.toISOString();
          } else {
            console.warn(`Invalid uploadedAt date string for invoice ID ${id}: "${doc.uploadedAt}". Defaulting.`);
            uploadedAtISO = new Date(0).toISOString();
          }
      }
  } else {
      if (doc.uploadedAt !== undefined && doc.uploadedAt !== null) {
        console.warn(`Missing or invalid type for uploadedAt (expected Date or string) for invoice ID ${id}: ${typeof doc.uploadedAt}. Defaulting.`);
      }
      uploadedAtISO = new Date(0).toISOString();
  }

  let deletedAtISO: string | undefined = undefined;
  if (doc.deletedAt instanceof Date && !isNaN(doc.deletedAt.getTime())) {
    deletedAtISO = doc.deletedAt.toISOString();
  } else if (typeof doc.deletedAt === 'string') {
    const parsedDate = parseISO(doc.deletedAt);
    if (isValid(parsedDate)) {
        deletedAtISO = parsedDate.toISOString();
    } else {
        const directParsed = new Date(doc.deletedAt);
        if (isValid(directParsed)) {
            deletedAtISO = directParsed.toISOString();
        } else {
            console.warn(`Invalid deletedAt date string for invoice ID ${id}: "${doc.deletedAt}". Not setting.`);
            deletedAtISO = undefined;
        }
    }
  } else if (doc.deletedAt !== null && doc.deletedAt !== undefined) {
    console.warn(`Invalid deletedAt type (expected Date or string) for invoice ID ${id}: ${typeof doc.deletedAt}. Not setting.`);
  }


  const lineItems: LineItem[] = [];
  if (Array.isArray(doc.lineItems)) {
    doc.lineItems.forEach((item: any, index: number) => {
      if (item && typeof item === 'object') {
        lineItems.push({
          description: (typeof item.description === 'string' && item.description) ? item.description : `Item ${index + 1} - N/A`,
          amount: typeof item.amount === 'number' ? item.amount : 0,
        });
      } else {
        console.warn(`Invalid line item at index ${index} for invoice ID ${id}:`, item);
      }
    });
  } else if (doc.lineItems !== undefined && doc.lineItems !== null) {
    console.warn(`lineItems is not an array for invoice ID ${id}:`, doc.lineItems);
  }
  
  const categories: string[] | undefined = (Array.isArray(doc.categories) && doc.categories.every(cat => typeof cat === 'string')) 
    ? doc.categories.filter(cat => cat.trim() !== "") // Filter out empty strings just in case
    : undefined;
  if (doc.categories !== undefined && !Array.isArray(doc.categories)) {
      console.warn(`categories is not an array for invoice ID ${id}:`, doc.categories);
  }

  const summaryEmbedding: number[] | undefined = (Array.isArray(doc.summaryEmbedding) && doc.summaryEmbedding.every(num => typeof num === 'number'))
    ? doc.summaryEmbedding
    : undefined;
  if (doc.summaryEmbedding !== undefined && !Array.isArray(doc.summaryEmbedding)) {
      console.warn(`summaryEmbedding is not an array for invoice ID ${id}:`, doc.summaryEmbedding);
  }
  
  return {
    id,
    userId,
    fileName,
    vendor,
    date, 
    total,
    lineItems,
    summary,
    summaryEmbedding,
    categories,
    isLikelyRecurring,
    recurrenceReasoning,
    uploadedAt: uploadedAtISO,
    gcsFileUri,
    isDeleted,
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

  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userIdString);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userIdString);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format. Please ensure you are logged in correctly.' };
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
    
    const dbDate = standardizeDateString(extractedData.date);

    const summaryInput: SummarizeInvoiceInput = {
      vendor: extractedData.vendor,
      date: dbDate,
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
      userId: userObjectId, 
      fileName: file.name,
      vendor: extractedData.vendor,
      date: dbDate, 
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

    const newInvoice: Invoice = mapDocumentToInvoice({
        _id: insertResult.insertedId,
        ...invoiceDocumentForDb
    });
    

    return {
      invoice: newInvoice,
      message: `Successfully processed ${file.name}. Data saved, categorized, and file stored.`
    };

  } catch (error: any) {
    console.error('--- DETAILED ERROR DURING INVOICE UPLOAD ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('File Name:', file?.name);
    console.error('File Type:', file?.type);
    console.error('File Size:', file?.size);
    console.error('User ID String:', userIdString);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
      if (error.stack) console.error('Error Stack:', error.stack);
      if (error.code) console.error('Error Code:', error.code);
      if (error.details) console.error('Error Details:', JSON.stringify(error.details, null, 2));
    }
    console.error('--- END OF DETAILED ERROR ---');

    let userFriendlyMessage = 'An unexpected error occurred while processing your invoice. Please try again later or contact support if the issue persists.';

    if (error?.name === 'BSONError' || (error?.message && String(error.message).includes('input must be a 24 character hex string'))) {
      userFriendlyMessage = 'There was an issue validating your user session. Please try logging out and logging back in.';
    } else if (error?.message && (String(error.message).includes('Deadline exceeded') || String(error.message).includes('unavailable') || String(error.message).includes('UNAVAILABLE') || (error?.code && (error.code === 'UNAVAILABLE' || error.code === 503 || error.code === 14)))) {
      userFriendlyMessage = 'The AI service is currently experiencing high load or is temporarily unavailable. Please try again in a few minutes.';
    } else if (error?.message && (String(error.message).includes('Invalid media type') || String(error.message).includes('Unsupported input content type'))) {
      userFriendlyMessage = "The AI service could not process the file's format. Please ensure it's a clear PDF, JPG, PNG, or WEBP image.";
    } else if (error?.message && (String(error.message).includes('unparsable') || String(error.message).includes('malformed'))) {
      userFriendlyMessage = 'The uploaded file appears to be corrupted or unreadable. Please try a different file.';
    } else if (error?.message && String(error.message).startsWith('GCS Upload Error')) {
      userFriendlyMessage = 'Failed to store the invoice file. Please try again. If the problem continues, check storage configuration.';
    } else if (error?.message && (String(error.message).includes('extractInvoiceDataFlow') || String(error.message).includes('summarizeInvoiceFlow'))) {
        userFriendlyMessage = `AI processing failed. This could be due to issues with the document content or AI service availability. Please try again.`;
    } else if (error?.message && String(error.message).includes('extractInvoiceData failed') || String(error.message).includes('summarizeInvoice failed') ){
        userFriendlyMessage = `AI processing failed: ${error.message}. Please check the document quality or try again.`;
    }
    
    return { error: userFriendlyMessage };
  }
}


export interface ManualInvoiceFormState {
    invoice?: Invoice;
    error?: string;
    message?: string;
    errors?: Partial<Record<keyof ManualInvoiceEntryData | `lineItems.${number}.description` | `lineItems.${number}.amount` | 'isMonthlyRecurring' | 'categoriesString', string[]>>;
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
    categoriesString: formData.get('categoriesString') as string | null,
  };

  if (!rawFormData.userId) {
    return { error: 'User ID is missing. Cannot process manual invoice.' };
  }
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(rawFormData.userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in handleManualInvoiceEntry ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', rawFormData.userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format.' };
  }


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
    categoriesString: rawFormData.categoriesString || '',
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

  const { userId, vendor, date, total, lineItems, isMonthlyRecurring, categoriesString } = validatedFields.data;
  const dbDate = standardizeDateString(date); 
  let finalCategories: string[] = [];

  const userProvidedCategories = (categoriesString || '').split(',').map(s => s.trim()).filter(s => s.length > 0);

  if (userProvidedCategories.length > 0) {
    finalCategories = userProvidedCategories;
  } else {
    try {
      const categorizationInput: CategorizeInvoiceInput = { vendor, lineItems };
      const categorizationOutput = await categorizeInvoice(categorizationInput);
      if (categorizationOutput?.categories?.length) {
        finalCategories = categorizationOutput.categories;
      } else {
        finalCategories = ["Uncategorized"];
      }
    } catch (catError: any) {
      console.warn('Failed to categorize manual invoice:', catError.message);
      finalCategories = ["Uncategorized"]; 
    }
  }


  try {
    const summaryInput: SummarizeInvoiceInput = { vendor, date: dbDate, total, lineItems };
    const summarizedData = await summarizeInvoice(summaryInput);

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
    
    const fileName = `Manual - ${vendor} - ${dbDate}`; 
    
    const { db } = await connectToDatabase();
    const invoiceDocumentForDb = {
      userId: userObjectId, // Use the validated ObjectId
      fileName,
      vendor,
      date: dbDate, 
      total,
      lineItems,
      summary: summarizedData.summary,
      summaryEmbedding,
      categories: finalCategories,
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
    console.error('--- DETAILED ERROR: Processing manual invoice entry ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Form Data (validated):', JSON.stringify(validatedFields.data, null, 2));
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
      if (error.stack) console.error('Error Stack:', error.stack);
    }
    console.error('--- END OF DETAILED ERROR ---');
    
    let userFriendlyMessage = 'An unexpected error occurred while processing the manual invoice. Please try again.';
     if (error?.message && (String(error.message).includes('Deadline exceeded') || String(error.message).includes('unavailable'))) {
      userFriendlyMessage = 'The AI service is currently busy or unavailable. Please try again in a few minutes.';
    }
    return { error: userFriendlyMessage };
  }
}

export interface UpdateInvoiceFormState {
    invoice?: Invoice;
    error?: string;
    message?: string;
    errors?: Partial<Record<keyof ManualInvoiceEntryData | `lineItems.${number}.description` | `lineItems.${number}.amount` | 'isMonthlyRecurring' | 'categoriesString', string[]>>;
}

export async function handleUpdateInvoice(
  invoiceIdToUpdate: string, 
  prevState: UpdateInvoiceFormState | undefined,
  formData: FormData
): Promise<UpdateInvoiceFormState> {
  const rawFormData = {
    userId: formData.get('userId') as string,
    invoiceId: formData.get('invoiceId') as string, 
    vendor: formData.get('vendor') as string,
    date: formData.get('invoiceDate') as string, 
    total: formData.get('total') as string,
    lineItems: [] as { description: string; amount: string }[],
    isMonthlyRecurring: formData.get('isMonthlyRecurring') === 'true',
    categoriesString: formData.get('categoriesString') as string | null,
  };

  if (!rawFormData.userId) return { error: 'User ID is missing.' };
  if (!rawFormData.invoiceId) return { error: 'Invoice ID is missing.' };
  if (invoiceIdToUpdate !== rawFormData.invoiceId) {
    return { error: "Invoice ID mismatch. Update cannot proceed." };
  }
  
  let userObjectId: ObjectId;
  let mongoInvoiceId: ObjectId;
  try {
      userObjectId = new ObjectId(rawFormData.userId);
      mongoInvoiceId = new ObjectId(invoiceIdToUpdate);
  } catch (e: any) {
      console.error('--- DETAILED ERROR: Invalid ID for BSON ObjectId in handleUpdateInvoice ---');
      console.error('Timestamp:', new Date().toISOString());
      console.error('Provided userIdString:', rawFormData.userId);
      console.error('Provided invoiceIdToUpdate:', invoiceIdToUpdate);
      console.error('Raw error object:', e);
      console.error('--- END OF DETAILED ERROR ---');
      return { error: 'Invalid User or Invoice ID format.' };
  }


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
    invoiceId: rawFormData.invoiceId,
    vendor: rawFormData.vendor,
    date: rawFormData.date, 
    total: parseFloat(rawFormData.total),
    lineItems: rawFormData.lineItems.map(li => ({
      description: li.description,
      amount: parseFloat(li.amount),
    })),
    isMonthlyRecurring: rawFormData.isMonthlyRecurring,
    categoriesString: rawFormData.categoriesString || '', 
  });

  if (!validatedFields.success) {
    const fieldErrors: UpdateInvoiceFormState['errors'] = {};
    for (const issue of validatedFields.error.issues) {
      const path = issue.path.join('.') as keyof UpdateInvoiceFormState['errors'];
      if (!fieldErrors[path]) { fieldErrors[path] = []; }
      fieldErrors[path]!.push(issue.message);
    }
    return { error: "Validation failed. Please check the fields.", errors: fieldErrors };
  }

  const { userId, vendor, date, total, lineItems, isMonthlyRecurring, categoriesString } = validatedFields.data;
  const dbDate = standardizeDateString(date); 

  try {
    const { db } = await connectToDatabase();
    
    const existingInvoice = await db.collection(INVOICES_COLLECTION).findOne({ _id: mongoInvoiceId, userId: userObjectId });
    if (!existingInvoice) {
      return { error: "Invoice not found or user not authorized to update." };
    }
    
    const updatedCategories = (categoriesString || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    const updatedIsLikelyRecurring = isMonthlyRecurring;
    const updatedRecurrenceReasoning = isMonthlyRecurring 
        ? "User marked as monthly recurring." 
        : `User marked as not monthly recurring on ${formatDateFn(new Date(), 'yyyy-MM-dd')}.`; 
    
    const fileName = existingInvoice.gcsFileUri ? existingInvoice.fileName : `Manual - ${vendor} - ${dbDate}`; 

    const updateFields: Partial<Invoice> & { vendor: string; date: string; total: number; lineItems: LineItem[]; categories: string[]; isLikelyRecurring: boolean; recurrenceReasoning: string; fileName: string; } = {
      vendor,
      date: dbDate, 
      total,
      lineItems,
      categories: updatedCategories,
      isLikelyRecurring: updatedIsLikelyRecurring,
      recurrenceReasoning: updatedRecurrenceReasoning,
      fileName,
    };

    const updateResult = await db.collection(INVOICES_COLLECTION).updateOne(
      { _id: mongoInvoiceId, userId: userObjectId },
      { $set: updateFields }
    );

    if (updateResult.matchedCount === 0) {
      return { error: 'Invoice not found or user not authorized to update.' };
    }

    const updatedDoc = await db.collection(INVOICES_COLLECTION).findOne({ _id: mongoInvoiceId });
    if (!updatedDoc) {
        return { error: 'Failed to retrieve updated invoice details.' };
    }
    const updatedInvoice = mapDocumentToInvoice(updatedDoc);

    const successMessage = updateResult.modifiedCount > 0 || updateResult.matchedCount === 1
        ? `Invoice for ${vendor} updated. Fields are now as submitted.`
        : `Invoice details are already up to date or no effective change was made.`;


    return { invoice: updatedInvoice, message: successMessage };

  } catch (error: any) {
    console.error('--- DETAILED ERROR: Updating invoice ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Invoice ID:', invoiceIdToUpdate);
    console.error('Form Data (validated):', JSON.stringify(validatedFields.data, null, 2));
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
      if (error.stack) console.error('Error Stack:', error.stack);
    }
    console.error('--- END OF DETAILED ERROR ---');
    
    return { error: 'An unexpected error occurred while updating the invoice. Please try again.' };
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
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in fetchUserInvoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format provided.' };
  }

  try {
    const { db } = await connectToDatabase();
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

  } catch (error: any)
   {
    console.error('--- DETAILED ERROR: Fetching user invoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while fetching your invoices. Please try again.' };
  }
}

export interface SoftDeleteResponse {
  success?: boolean;
  error?: string;
  deletedInvoiceId?: string;
}

export async function softDeleteInvoice(invoiceId: string, userId: string): Promise<SoftDeleteResponse> {
  if (!userId) return { error: 'User ID is required to delete an invoice.' };
  if (!invoiceId) return { error: 'Invoice ID is required to delete an invoice.' };

  let userObjectId: ObjectId;
  let invoiceObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
    invoiceObjectId = new ObjectId(invoiceId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid ID for BSON ObjectId in softDeleteInvoice ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Provided invoiceIdString:', invoiceId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User or Invoice ID format.' };
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection(INVOICES_COLLECTION).updateOne(
      { _id: invoiceObjectId, userId: userObjectId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return { error: 'Invoice not found or user not authorized to delete.' };
    }
    if (result.modifiedCount === 0) {
      const currentDoc = await db.collection(INVOICES_COLLECTION).findOne({ _id: invoiceObjectId, userId: userObjectId});
      if (currentDoc && currentDoc.isDeleted) {
        return { success: true, deletedInvoiceId: invoiceId }; 
      }
      return { error: 'Invoice was not modified. It might already be deleted or data was identical.' };
    }

    return { success: true, deletedInvoiceId: invoiceId };
  } catch (error: any) {
    console.error('--- DETAILED ERROR: Soft deleting invoice ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Invoice ID:', invoiceId, 'User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while deleting the invoice. Please try again.' };
  }
}


export interface FetchInvoiceByIdResponse {
  invoice?: Invoice;
  error?: string;
}

export async function fetchInvoiceById(invoiceId: string, userId: string): Promise<FetchInvoiceByIdResponse> {
  if (!userId) return { error: 'User ID is required.' };
  if (!invoiceId) return { error: 'Invoice ID is required.' };

  let userObjectId: ObjectId;
  let currentInvoiceObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
    currentInvoiceObjectId = new ObjectId(invoiceId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid ID for BSON ObjectId in fetchInvoiceById ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Provided invoiceIdString:', invoiceId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User or Invoice ID format.' };
  }

  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection(INVOICES_COLLECTION).findOne({
      _id: currentInvoiceObjectId,
      userId: userObjectId,
      isDeleted: { $ne: true }
    });

    if (!doc) {
      return { error: 'Invoice not found or you do not have permission to view it.' };
    }
    
    const invoice = mapDocumentToInvoice(doc);
    return { invoice };

  } catch (error: any) {
    console.error(`--- DETAILED ERROR: Fetching invoice by ID (${invoiceId}) ---`);
    console.error('Timestamp:', new Date().toISOString());
    console.error('User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while fetching invoice details. Please try again.' };
  }
}

export interface SearchInvoicesResponse {
  invoices?: Invoice[];
  error?: string;
}

export async function searchInvoices(userId: string, searchText: string): Promise<SearchInvoicesResponse> {
  if (!userId) return { error: 'User ID is required to search invoices.' };
  
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in searchInvoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format.' };
  }

  if (!searchText || searchText.trim() === '') {
    return fetchUserInvoices(userId); // Re-fetch all if search is empty
  }

  try {
    const { db } = await connectToDatabase();
    const queryEmbeddingResponse = await ai.embed({ content: searchText });
    
    if (!queryEmbeddingResponse || !queryEmbeddingResponse.embedding || !Array.isArray(queryEmbeddingResponse.embedding)) {
      console.error('Failed to generate embedding for search query. AI response:', queryEmbeddingResponse);
      return { error: 'Failed to prepare search query. The AI service might be unavailable or the query is invalid.' };
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
    console.error('--- DETAILED ERROR IN searchInvoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Search Text:', searchText);
    console.error('User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
      if (error.stack) console.error('Error Stack:', error.stack);
      if (error.code) console.error('Error Code:', error.code);
    }
    console.error('--- END OF DETAILED searchInvoices ERROR ---');

    let userFriendlyMessage = 'An unexpected error occurred during search. Please try again.';
    if (error?.message) {
        const lowerMessage = String(error.message).toLowerCase();
        if (lowerMessage.includes('index not found') || lowerMessage.includes(ATLAS_VECTOR_SEARCH_INDEX_NAME.toLowerCase())) {
            userFriendlyMessage = `Search is temporarily unavailable due to a configuration issue. Administrators have been notified.`;
        } else if (lowerMessage.includes('queryvector parameter must be an array of numbers')) {
            userFriendlyMessage = 'The search query could not be processed. Please try rephrasing your search.';
        } else if (lowerMessage.includes('summaryembedding field must be an array type')) {
            userFriendlyMessage = 'Search encountered data consistency issues. Administrators have been notified.';
        } else if (lowerMessage.includes('deadline exceeded') || lowerMessage.includes('unavailable')) {
            userFriendlyMessage = 'The search service is currently busy or unavailable. Please try again in a few moments.';
        }
    }
    return { error: userFriendlyMessage };
  }
}

export interface FindSimilarInvoicesResponse {
  similarInvoices?: Invoice[];
  error?: string;
}

export async function findSimilarInvoices(currentInvoiceId: string, userId: string): Promise<FindSimilarInvoicesResponse> {
  if (!userId) return { error: 'User ID is required.' };
  if (!currentInvoiceId) return { error: 'Current Invoice ID is required.' };

  let currentInvoiceObjectId: ObjectId;
  let userObjectId: ObjectId;
  try {
    currentInvoiceObjectId = new ObjectId(currentInvoiceId);
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid ID for BSON ObjectId in findSimilarInvoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided currentInvoiceIdString:', currentInvoiceId);
    console.error('Provided userIdString:', userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid Invoice ID or User ID format.' };
  }

  try {
    const { db } = await connectToDatabase();
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
      { $match: { _id: { $ne: currentInvoiceObjectId } } },
      { $limit: 5 }
    ];

    const similarDocuments = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    const similarInvoices: Invoice[] = similarDocuments.map(mapDocumentToInvoice);
    return { similarInvoices };

  } catch (error: any) {
    console.error('--- DETAILED ERROR IN findSimilarInvoices ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('CurrentInvoiceID:', currentInvoiceId, 'User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED findSimilarInvoices ERROR ---');

    let userFriendlyMessage = 'An unexpected error occurred while finding similar invoices. Please try again.';
     if (error?.message) {
        const lowerMessage = String(error.message).toLowerCase();
        if (lowerMessage.includes('index not found') || lowerMessage.includes(ATLAS_VECTOR_SEARCH_INDEX_NAME.toLowerCase())) {
            userFriendlyMessage = `Similar invoice search is temporarily unavailable due to a configuration issue.`;
        } else if (lowerMessage.includes('deadline exceeded') || lowerMessage.includes('unavailable')) {
            userFriendlyMessage = 'The AI service for similarity search is currently busy. Please try again shortly.';
        }
    }
    return { error: userFriendlyMessage };
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
  if (!userId) return { error: 'User ID is required.' };
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
     console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in fetchSpendingDistribution ---');
     console.error('Timestamp:', new Date().toISOString());
     console.error('Provided userIdString:', userId);
     console.error('Raw error object:', e);
     console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format.' };
  }

  try {
    const { db } = await connectToDatabase();
    const pipeline = [
      { $match: { userId: userObjectId, isDeleted: { $ne: true }, categories: { $exists: true, $ne: [] } } },
      { $unwind: '$categories' },
      { $group: { _id: '$categories', totalSpent: { $sum: '$total' } } },
      { $project: { _id: 0, category: '$_id', totalSpent: 1 } },
      { $sort: { totalSpent: -1 } }
    ];

    const result = await db.collection(INVOICES_COLLECTION).aggregate(pipeline).toArray();
    const data: SpendingByCategory[] = result.map(item => ({
        category: item.category as string,
        totalSpent: item.totalSpent as number,
    }));
    return { data };

  } catch (error: any) {
    console.error('--- DETAILED ERROR: Fetching spending distribution ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('User ID:', userId);
    console.error('Raw error object:', error);
     if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while fetching spending data. Please try again.' };
  }
}


export interface ToggleRecurrenceResponse {
    invoice?: Invoice;
    error?: string;
}

export async function toggleInvoiceRecurrence(invoiceId: string, userId: string): Promise<ToggleRecurrenceResponse> {
    if (!userId) return { error: 'User ID is required.' };
    if (!invoiceId) return { error: 'Invoice ID is required.' };

    let userObjectId: ObjectId;
    let currentInvoiceObjectId: ObjectId;
    try {
        userObjectId = new ObjectId(userId);
        currentInvoiceObjectId = new ObjectId(invoiceId);
    } catch (e: any) {
        console.error('--- DETAILED ERROR: Invalid ID for BSON ObjectId in toggleInvoiceRecurrence ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Provided userIdString:', userId);
        console.error('Provided invoiceIdString:', invoiceId);
        console.error('Raw error object:', e);
        console.error('--- END OF DETAILED ERROR ---');
        return { error: 'Invalid Invoice ID or User ID format.' };
    }

    try {
        const { db } = await connectToDatabase();
        const currentInvoiceDoc = await db.collection(INVOICES_COLLECTION).findOne({
            _id: currentInvoiceObjectId,
            userId: userObjectId,
            isDeleted: { $ne: true },
        });

        if (!currentInvoiceDoc) {
            return { error: 'Invoice not found or you do not have permission to modify it.' };
        }

        const currentIsLikelyRecurring = currentInvoiceDoc.isLikelyRecurring || false;
        const newIsLikelyRecurring = !currentIsLikelyRecurring;
        const newReasoning = `Manually set to ${newIsLikelyRecurring ? 'monthly recurring' : 'not monthly recurring'} by user on ${formatDateFn(new Date(), 'yyyy-MM-dd')}.`;

        const updateResult = await db.collection(INVOICES_COLLECTION).updateOne(
            { _id: currentInvoiceObjectId, userId: userObjectId },
            { $set: { isLikelyRecurring: newIsLikelyRecurring, recurrenceReasoning: newReasoning } }
        );

        if (updateResult.matchedCount === 0) return { error: 'Invoice not found or user not authorized.' };
        
        const updatedDoc = await db.collection(INVOICES_COLLECTION).findOne({ _id: currentInvoiceObjectId });
        if (!updatedDoc) return { error: 'Failed to retrieve updated invoice details.' };
        
        const updatedInvoice = mapDocumentToInvoice(updatedDoc);
        return { invoice: updatedInvoice };

    } catch (error: any) {
        console.error('--- DETAILED ERROR: Toggling invoice recurrence ---');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Invoice ID:', invoiceId, 'User ID:', userId);
        console.error('Raw error object:', error);
        if (error && typeof error === 'object') {
            console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
            console.error('Error Message:', String(error.message) || 'N/A');
        }
        console.error('--- END OF DETAILED ERROR ---');
        return { error: 'An unexpected error occurred while updating recurrence status. Please try again.' };
    }
}

export interface FetchInvoicesByMonthResponse {
  invoices?: Invoice[];
  error?: string;
}

export async function fetchInvoicesByMonth(userId: string, year: number, month: number): Promise<FetchInvoicesByMonthResponse> {
  if (!userId) return { error: 'User ID is required.' };
  if (!year || !month || month < 1 || month > 12) return { error: 'Valid year and month (1-12) are required.'};

  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in fetchInvoicesByMonth ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format.' };
  }

  try {
    const { db } = await connectToDatabase();
    const startDate = new Date(Date.UTC(year, month - 1, 1)); 
    const startQueryDate = formatDateFn(startDate, 'yyyy-MM-dd');
    const endQueryDate = formatDateFn(new Date(Date.UTC(year, month, 0)), 'yyyy-MM-dd');

    const invoiceDocuments = await db
      .collection(INVOICES_COLLECTION)
      .find({
        userId: userObjectId,
        isDeleted: { $ne: true },
        date: { $gte: startQueryDate, $lte: endQueryDate }
      })
      .sort({ date: 1, uploadedAt: -1 }) 
      .toArray();

    const invoices: Invoice[] = invoiceDocuments.map(mapDocumentToInvoice);
    return { invoices };

  } catch (error: any) {
    console.error('--- DETAILED ERROR: Fetching invoices by month ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('User ID:', userId, 'Year:', year, 'Month:', month);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while fetching monthly invoices. Please try again.' };
  }
}


// Types for Advanced Spending Analytics
export interface MonthlySpendingData {
  month: string; // YYYY-MM format
  totalSpent: number;
}

export interface OverallSpendingMetrics {
  totalOverallSpending: number;
  averageMonthlySpending: number;
  numberOfActiveMonths: number;
  firstMonthActive?: string; // YYYY-MM
  lastMonthActive?: string; // YYYY-MM
}

export interface FetchSpendingAnalyticsResponse {
  monthlyBreakdown?: MonthlySpendingData[];
  overallMetrics?: OverallSpendingMetrics;
  error?: string;
}

export async function fetchSpendingAnalytics(userId: string): Promise<FetchSpendingAnalyticsResponse> {
  if (!userId) return { error: 'User ID is required.' };
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(userId);
  } catch (e: any) {
    console.error('--- DETAILED ERROR: Invalid User ID for BSON ObjectId in fetchSpendingAnalytics ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Provided userIdString:', userId);
    console.error('Raw error object:', e);
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'Invalid User ID format for spending analytics.' };
  }

  try {
    const { db } = await connectToDatabase();
    const monthlyBreakdownPipeline = [
      { $match: { userId: userObjectId, isDeleted: { $ne: true } } },
      { $addFields: { yearMonth: { $substrCP: ["$date", 0, 7] } } }, // Extracts YYYY-MM
      { $group: { _id: "$yearMonth", totalSpent: { $sum: "$total" } } },
      { $sort: { _id: 1 } }, // Sort by month YYYY-MM ascending
      { $project: { _id: 0, month: "$_id", totalSpent: 1 } }
    ];

    const monthlyBreakdownResult = await db.collection(INVOICES_COLLECTION).aggregate(monthlyBreakdownPipeline).toArray();
    const monthlyBreakdown: MonthlySpendingData[] = monthlyBreakdownResult.map(item => ({
      month: item.month as string,
      totalSpent: item.totalSpent as number,
    }));

    if (monthlyBreakdown.length === 0) {
      return { 
        monthlyBreakdown: [], 
        overallMetrics: { 
          totalOverallSpending: 0, 
          averageMonthlySpending: 0, 
          numberOfActiveMonths: 0 
        } 
      };
    }

    let totalOverallSpending = 0;
    monthlyBreakdown.forEach(item => {
      totalOverallSpending += item.totalSpent;
    });

    const numberOfActiveMonths = monthlyBreakdown.length;
    const averageMonthlySpending = numberOfActiveMonths > 0 ? totalOverallSpending / numberOfActiveMonths : 0;
    
    const firstMonthActive = monthlyBreakdown[0]?.month;
    const lastMonthActive = monthlyBreakdown[monthlyBreakdown.length - 1]?.month;

    const overallMetrics: OverallSpendingMetrics = {
      totalOverallSpending,
      averageMonthlySpending,
      numberOfActiveMonths,
      firstMonthActive,
      lastMonthActive,
    };

    return { monthlyBreakdown, overallMetrics };

  } catch (error: any) {
    console.error('--- DETAILED ERROR: Fetching spending analytics ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('User ID:', userId);
    console.error('Raw error object:', error);
    if (error && typeof error === 'object') {
      console.error('Error Type/Name:', error.name || (error.constructor && error.constructor.name) || 'N/A');
      console.error('Error Message:', String(error.message) || 'N/A');
    }
    console.error('--- END OF DETAILED ERROR ---');
    return { error: 'An unexpected error occurred while fetching spending analytics. Please try again.' };
  }
}


    