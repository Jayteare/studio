
"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { fetchInvoiceById, type FetchInvoiceByIdResponse } from '@/app/dashboard/actions';
import type { Invoice, LineItem } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableCaption } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, FileText, CalendarDays, CircleDollarSign, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { AppLogo } from '@/components/app-logo';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils'; // Added import for cn

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const invoiceId = Array.isArray(params.invoiceId) ? params.invoiceId[0] : params.invoiceId;

  const loadInvoiceDetails = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !invoiceId) {
      if (!authIsLoading && !isAuthenticated) {
        router.replace('/login');
      }
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const response: FetchInvoiceByIdResponse = await fetchInvoiceById(invoiceId, user.id);

    if (response.error) {
      setError(response.error);
      toast({
        title: 'Error Fetching Invoice',
        description: response.error,
        variant: 'destructive',
      });
      setInvoice(null);
    } else if (response.invoice) {
      setInvoice(response.invoice);
    } else {
      setError('Invoice not found or an unexpected error occurred.');
      toast({
        title: 'Invoice Not Found',
        description: 'The requested invoice could not be loaded.',
        variant: 'destructive',
      });
    }
    setIsLoading(false);
  }, [invoiceId, user?.id, isAuthenticated, authIsLoading, router, toast]);

  useEffect(() => {
    loadInvoiceDetails();
  }, [loadInvoiceDetails]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) { // Handle cases where date might be 'Unknown Date' or invalid
        const parts = dateString.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
        if (parts) {
            let year = parseInt(parts[3]);
            if (year < 100) year += 2000; // Basic two-digit year handling
            return format(new Date(year, parseInt(parts[1]) - 1, parseInt(parts[2])), 'PPP'); // e.g. Jun 1, 2023
        }
        return dateString; // Return original if unparseable
      }
      return format(date, 'PPP p'); // e.g. Jun 1, 2023, 12:00:00 AM
    } catch (error) {
      console.warn(`Could not parse date: ${dateString}`);
      return dateString;
    }
  };

  const formatCurrency = (amount?: number) => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getGcsPublicUrl = (gcsUri?: string): string | null => {
    if (!gcsUri || !gcsUri.startsWith('gs://')) return null;
    const [_, bucket, ...filePathParts] = gcsUri.replace('gs://', '').split('/');
    const filePath = filePathParts.join('/');
    return `https://storage.googleapis.com/${bucket}/${filePath}`;
  }

  if (authIsLoading || isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Invoice Details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Error Loading Invoice</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <Info className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Invoice Not Found</h1>
        <p className="text-muted-foreground mb-6">The invoice you are looking for does not exist or you may not have permission to view it.</p>
        <Button onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const publicGcsUrl = getGcsPublicUrl(invoice.gcsFileUri);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
          <AppLogo iconSizeClass="h-7 w-7" textSizeClass="text-2xl" />
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-4xl p-4 md:p-8">
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-start">
                <div>
                    <CardTitle className="font-headline text-3xl mb-1">{invoice.vendor || 'Invoice Details'}</CardTitle>
                    <CardDescription>Details for invoice: {invoice.fileName}</CardDescription>
                </div>
                {publicGcsUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={publicGcsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Original
                    </Link>
                  </Button>
                )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Vendor</Label>
                <p className="text-lg font-semibold">{invoice.vendor || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Invoice Date</Label>
                <p className="text-lg">{formatDate(invoice.date)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Total Amount</Label>
                <p className="text-lg font-bold text-primary">{formatCurrency(invoice.total)}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">Uploaded At</Label>
                <p className="text-lg">{formatDate(invoice.uploadedAt)}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground flex items-center gap-1"><FileText className="h-4 w-4" /> AI Summary</Label>
              <p className="text-base bg-muted/50 p-3 rounded-md leading-relaxed">
                {invoice.summary || 'No summary available.'}
              </p>
            </div>

            {invoice.lineItems && invoice.lineItems.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Line Items</Label>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.lineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.description || 'N/A'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
           <CardFooter className="flex justify-center pt-6">
             <Badge variant="outline">Invoice ID: {invoice.id}</Badge>
           </CardFooter>
        </Card>
      </main>
       <footer className="py-6 md:px-8 md:py-0 border-t border-border/40 mt-auto">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-20 md:flex-row">
            <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
              © {new Date().getFullYear()} Invoice Insights. Your smart invoice assistant.
            </p>
          </div>
        </footer>
    </div>
  );
}

// Helper component, not exported from this file
const Label: React.FC<React.HTMLAttributes<HTMLLabelElement>> = ({ className, children, ...props }) => (
  <label className={cn("block text-sm font-medium text-muted-foreground", className)} {...props}>
    {children}
  </label>
);

