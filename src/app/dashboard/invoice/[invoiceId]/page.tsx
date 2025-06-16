
"use client";

import { useEffect, useState, useCallback, useActionState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { 
    fetchInvoiceById, type FetchInvoiceByIdResponse, 
    findSimilarInvoices, type FindSimilarInvoicesResponse, 
    toggleInvoiceRecurrence, type ToggleRecurrenceResponse,
    handleUpdateInvoice, type UpdateInvoiceFormState
} from '@/app/dashboard/actions';
import type { Invoice, LineItem } from '@/types/invoice';
import { ManualInvoiceForm } from '@/components/manual-invoice-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, FileText, CalendarDays, CircleDollarSign, Info, AlertTriangle, ExternalLink, Copy, Tag, Repeat, XCircle, EditIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { AppLogo } from '@/components/app-logo';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [similarInvoices, setSimilarInvoices] = useState<Invoice[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [errorSimilar, setErrorSimilar] = useState<string | null>(null);
  const [isTogglingRecurrence, setIsTogglingRecurrence] = useState(false);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const invoiceId = Array.isArray(params.invoiceId) ? params.invoiceId[0] : params.invoiceId;

  // Action state for updating the invoice
  const [updateFormState, updateInvoiceAction, isUpdatePending] = useActionState(
    // Bind the invoiceId to the server action if it exists
    invoiceId ? handleUpdateInvoice.bind(null, invoiceId) : async () => ({ error: "Invoice ID missing" }), 
    undefined as UpdateInvoiceFormState | undefined
  );


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


  const loadSimilarInvoices = useCallback(async () => {
    if (!invoice || !user?.id) return;

    if (!invoice.summaryEmbedding || invoice.summaryEmbedding.length === 0) {
        setSimilarInvoices([]);
        return;
    }

    setIsLoadingSimilar(true);
    setErrorSimilar(null);
    const response: FindSimilarInvoicesResponse = await findSimilarInvoices(invoice.id, user.id);

    if (response.error) {
      setErrorSimilar(response.error);
      setSimilarInvoices([]);
    } else if (response.similarInvoices) {
      setSimilarInvoices(response.similarInvoices);
    }
    setIsLoadingSimilar(false);
  }, [invoice, user?.id]); 

  useEffect(() => {
    if (invoice && user?.id) {
      loadSimilarInvoices();
    }
  }, [invoice, user?.id, loadSimilarInvoices]);

  const handleToggleRecurrence = async () => {
    if (!invoice || !user?.id) return;

    setIsTogglingRecurrence(true);
    const response: ToggleRecurrenceResponse = await toggleInvoiceRecurrence(invoice.id, user.id);
    setIsTogglingRecurrence(false);

    if (response.error) {
        toast({
            title: 'Update Failed',
            description: response.error,
            variant: 'destructive',
        });
    } else if (response.invoice) {
        setInvoice(response.invoice); 
        toast({
            title: 'Recurrence Status Updated',
            description: `Invoice marked as ${response.invoice.isLikelyRecurring ? 'monthly recurring' : 'not monthly recurring'}.`,
            variant: 'default',
        });
    }
  };

  const handleEditSuccess = (updatedInvoice: Invoice) => {
    setInvoice(updatedInvoice); // Update the local state for immediate reflection
    setIsEditDialogOpen(false);
    // Optionally, trigger a full reload of similar invoices if content changed significantly
    // loadSimilarInvoices(); 
    // The toast for success is handled within ManualInvoiceForm via serverAction result
  };


  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      let date = parseISO(dateString); // Use parseISO for reliability with ISO strings
      if (isNaN(date.getTime())) {
         // Fallback for non-ISO simple dates, e.g. YYYY-MM-DD from calendar picker
        const parts = dateString.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (parts) {
            date = new Date(parseInt(parts[1]), parseInt(parts[2]) - 1, parseInt(parts[3]));
        } else {
            // Further fallback for MM/DD/YYYY or other common formats if necessary
             const commonFormatParts = dateString.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
             if (commonFormatParts) {
                let year = parseInt(commonFormatParts[3], 10);
                if (year < 100) year += 2000;
                date = new Date(year, parseInt(commonFormatParts[1], 10) - 1, parseInt(commonFormatParts[2], 10));
             } else {
                console.warn(`Could not parse date string with known formats: ${dateString}`);
                return dateString; 
             }
        }
      }
      if (isNaN(date.getTime())) {
        console.warn(`Final parsed date is invalid for: ${dateString}`);
        return dateString;
      }
      
      // For full datetime strings (like uploadedAt), 'PPP p' is fine
      // For date-only strings, 'PPP' is better
      if (dateString.length === 10 && dateString.includes('-')) { // Likely YYYY-MM-DD
        return format(date, 'PPP');
      }
      return format(date, 'PPP p');
    } catch (error) {
      console.warn(`Error formatting date: ${dateString}`, error);
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)} disabled={isUpdatePending}>
                <EditIcon className="mr-2 h-4 w-4" />
                Edit Invoice
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
            </Button>
          </div>
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
                {publicGcsUrl && invoice.gcsFileUri && (
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

            {invoice.categories && invoice.categories.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground flex items-center gap-1"><Tag className="h-4 w-4" /> AI Suggested Categories</Label>
                    <div className="flex flex-wrap gap-2">
                        {invoice.categories.map((category, index) => (
                            <Badge key={index} variant="secondary">{category}</Badge>
                        ))}
                    </div>
                </div>
            )}
             {invoice.isLikelyRecurring !== undefined && (
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label className="text-sm text-muted-foreground flex items-center gap-1">
                            <Info className="h-4 w-4" /> AI Recurrence Check
                        </Label>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleToggleRecurrence}
                            disabled={isTogglingRecurrence}
                        >
                            {isTogglingRecurrence ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (invoice.isLikelyRecurring ? <XCircle className="mr-2 h-4 w-4" /> : <Repeat className="mr-2 h-4 w-4" />)}
                            {invoice.isLikelyRecurring ? "Mark as NOT Monthly Recurring" : "Mark as Monthly Recurring"}
                        </Button>
                    </div>
                    <p className={cn(
                        "text-base p-3 rounded-md", 
                        invoice.isLikelyRecurring ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                        )}>
                        {invoice.isLikelyRecurring ? "Likely a recurring monthly expense." : "Not clearly a recurring monthly expense."}
                        {invoice.recurrenceReasoning && <span className="block text-xs mt-1 opacity-80">Reasoning: {invoice.recurrenceReasoning}</span>}
                    </p>
                </div>
            )}


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

        { (invoice.summaryEmbedding && invoice.summaryEmbedding.length > 0) && (
          <Card className="shadow-lg mt-8">
            <CardHeader>
              <CardTitle className="font-headline text-2xl flex items-center gap-2">
                <Copy className="h-5 w-5 text-primary" /> 
                Similar Invoices
              </CardTitle>
              <CardDescription>Other invoices with similar content based on AI analysis of their summaries.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSimilar && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="ml-3 text-muted-foreground">Finding similar invoices...</p>
                </div>
              )}
              {errorSimilar && !isLoadingSimilar && (
                <div className="text-destructive text-center py-6">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                  <p>Could not load similar invoices: {errorSimilar}</p>
                </div>
              )}
              {!isLoadingSimilar && !errorSimilar && similarInvoices.length === 0 && (
                <p className="text-muted-foreground text-center py-6">No significantly similar invoices found for "{invoice.vendor}".</p>
              )}
              {!isLoadingSimilar && !errorSimilar && similarInvoices.length > 0 && (
                <div className="space-y-4">
                  {similarInvoices.map((simInv) => (
                    <Card key={simInv.id} className="bg-muted/30 hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1">
                                <Link href={`/dashboard/invoice/${simInv.id}`} className="text-primary hover:underline">
                                    <h4 className="font-semibold">{simInv.vendor}</h4>
                                </Link>
                                <p className="text-xs text-muted-foreground truncate max-w-xs" title={simInv.fileName}>
                                  {simInv.gcsFileUri ? simInv.fileName : '(Manual Entry)'}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-semibold text-primary">{formatCurrency(simInv.total)}</p>
                                <p className="text-xs text-muted-foreground">{formatDate(simInv.date).split(',')[0]}</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2" title={simInv.summary}>
                          {simInv.summary}
                        </p>
                         {simInv.categories && simInv.categories.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {simInv.categories.map((category, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">{category}</Badge>
                                ))}
                            </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
             { !isLoadingSimilar && !errorSimilar && similarInvoices.length > 0 && (
                <CardFooter className="text-xs text-muted-foreground justify-center">
                    Found {similarInvoices.length} similar invoice{similarInvoices.length === 1 ? "" : "s"}.
                </CardFooter>
            )}
          </Card>
        )}
      </main>
       <footer className="py-6 md:px-8 md:py-0 border-t border-border/40 mt-auto">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-20 md:flex-row">
            <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
              © {new Date().getFullYear()} Invoice Insights. Your smart invoice assistant.
            </p>
          </div>
        </footer>

        {user?.id && invoice && (
            <ManualInvoiceForm
                userId={user.id}
                mode="edit"
                invoiceToEdit={invoice}
                isOpen={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                serverAction={updateInvoiceAction}
                isActionPending={isUpdatePending}
                onFormSuccess={handleEditSuccess}
            />
        )}
    </div>
  );
}

const Label: React.FC<React.HTMLAttributes<HTMLLabelElement>> = ({ className, children, ...props }) => (
  <label className={cn("block text-sm font-medium text-muted-foreground", className)} {...props}>
    {children}
  </label>
);
