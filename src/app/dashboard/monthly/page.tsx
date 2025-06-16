
"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange, ArrowLeft, Loader2, AlertTriangle, Info, Search } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { fetchInvoicesByMonth, type FetchInvoicesByMonthResponse } from '@/app/dashboard/actions';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { AppLogo } from '@/components/app-logo';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { softDeleteInvoice, type SoftDeleteResponse } from '@/app/dashboard/actions';


const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => ({ value: (currentYear - i).toString(), label: (currentYear - i).toString() }));
const months = Array.from({ length: 12 }, (_, i) => ({ value: (i + 1).toString(), label: new Date(0, i).toLocaleString('default', { month: 'long' }) }));


export default function MonthlyViewPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  
  const [monthlyInvoices, setMonthlyInvoices] = useState<Invoice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);


  const loadMonthlyInvoices = useCallback(async () => {
    if (!isAuthenticated || !user?.id || !selectedYear || !selectedMonth) {
      if (!authIsLoading && !isAuthenticated) {
        router.replace('/login');
      }
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setError(null);
    setHasFetched(true);

    const yearNum = parseInt(selectedYear, 10);
    const monthNum = parseInt(selectedMonth, 10);

    const response: FetchInvoicesByMonthResponse = await fetchInvoicesByMonth(user.id, yearNum, monthNum);

    if (response.error) {
      setError(response.error);
      toast({
        title: 'Error Fetching Monthly Invoices',
        description: response.error,
        variant: 'destructive',
      });
      setMonthlyInvoices([]);
    } else if (response.invoices) {
      setMonthlyInvoices(response.invoices);
    } else {
      setMonthlyInvoices([]); 
    }
    setIsLoadingData(false);
  }, [user?.id, isAuthenticated, authIsLoading, router, toast, selectedYear, selectedMonth]);


  const handleViewInvoices = () => {
    if (selectedYear && selectedMonth) {
        loadMonthlyInvoices();
    } else {
        toast({
            title: 'Selection Missing',
            description: 'Please select both a year and a month.',
            variant: 'destructive'
        })
    }
  };

  const openDeleteConfirmDialog = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete || !user?.id) return;

    const response: SoftDeleteResponse = await softDeleteInvoice(invoiceToDelete.id, user.id);
    if (response.success && response.deletedInvoiceId) {
      setMonthlyInvoices((prevInvoices) => prevInvoices.filter((inv) => inv.id !== response.deletedInvoiceId));
      toast({
        title: 'Invoice Deleted',
        description: `Invoice "${invoiceToDelete.fileName || invoiceToDelete.vendor}" has been moved to trash.`,
        variant: 'default',
      });
    } else {
      toast({
        title: 'Deletion Failed',
        description: response.error || 'Could not delete the invoice.',
        variant: 'destructive',
      });
    }
    setIsDeleteDialogOpen(false);
    setInvoiceToDelete(null);
  };

  if (authIsLoading ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Monthly View...</p>
      </div>
    );
  }

  return (
    <>
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

      <main className="flex-1 container mx-auto max-w-5xl p-4 md:p-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-3xl mb-1 flex items-center gap-2">
              <CalendarRange className="h-7 w-7 text-primary" />
              Monthly Invoice View
            </CardTitle>
            <CardDescription>
              Select a year and month to view invoices processed for that period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="year-select">Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger id="year-select">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(year => (
                      <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="month-select">Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger id="month-select">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map(month => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleViewInvoices} disabled={isLoadingData} className="w-full sm:w-auto">
                {isLoadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                View Invoices
              </Button>
            </div>

            {isLoadingData && (
                 <div className="flex flex-col items-center justify-center py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Fetching invoices...</p>
                </div>
            )}
            {error && !isLoadingData && (
              <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-6 rounded-md">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">Could not load invoices</p>
                <p className="text-center">{error}</p>
              </div>
            )}
            {!isLoadingData && !error && hasFetched && monthlyInvoices.length === 0 && (
              <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md mt-6">
                <Info className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">No Invoices Found</p>
                <p className="text-center">
                    No invoices were found for {months.find(m=>m.value === selectedMonth)?.label} {selectedYear}.
                </p>
              </div>
            )}
            {!isLoadingData && !error && monthlyInvoices.length > 0 && (
                <div className="mt-6">
                    <InvoiceList invoices={monthlyInvoices} onDeleteInvoice={openDeleteConfirmDialog} />
                </div>
            )}
             {!isLoadingData && !error && !hasFetched && (
                <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md mt-6">
                    <Info className="h-12 w-12 mb-4" />
                    <p className="text-xl font-semibold">Select Period</p>
                    <p className="text-center">
                        Please select a year and month, then click "View Invoices".
                    </p>
                </div>
            )}

          </CardContent>
           {monthlyInvoices.length > 0 && !isLoadingData && (
            <CardFooter>
                <p className="text-sm text-muted-foreground">
                    Displaying {monthlyInvoices.length} invoice{monthlyInvoices.length === 1 ? '' : 's'} for {months.find(m=>m.value === selectedMonth)?.label} {selectedYear}.
                </p>
            </CardFooter>
           )}
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
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will move the invoice
              "{invoiceToDelete?.fileName || invoiceToDelete?.vendor}"
              to the trash. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Yes, Delete Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

