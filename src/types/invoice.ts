
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
  uploadedAt: string; // ISO string date
  invoiceDataUri?: string; // To store the base64 encoded file content
}
