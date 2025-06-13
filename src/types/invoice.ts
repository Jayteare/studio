
export interface LineItem {
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  userId: string; // To associate with a logged-in user
  fileName: string;
  vendor: string;
  date: string; // Consider standardizing to ISO string format
  total: number;
  lineItems: LineItem[];
  summary: string; // AI-generated summary
  summaryEmbedding?: number[]; // Vector embedding of the summary
  categories?: string[]; // AI-suggested categories
  isLikelyRecurring?: boolean; // AI-determined likelihood of being a recurring expense
  recurrenceReasoning?: string; // AI's reasoning if it's likely recurring
  uploadedAt: string; // ISO string date
  gcsFileUri?: string; // GCS URI for the stored invoice file (e.g., gs://bucket/path/to/file)
  isDeleted?: boolean;
  deletedAt?: string; // ISO string date when soft deleted
}
