
"use client";

import { useState, useEffect, useCallback, FormEvent, useActionState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InvoiceUploadForm } from '@/components/invoice-upload-form';
import { ManualInvoiceForm } from '@/components/manual-invoice-form';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, Search, XCircle, PlusCircle, BarChartHorizontalBig, CalendarDays, CalendarIcon, FilterX } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { Separator } from '@/components/ui/separator';
import {
    fetchUserInvoices,
    softDeleteInvoice,
    searchInvoices,
    handleManualInvoiceEntry,
    type FetchInvoicesResponse,
    type SoftDeleteResponse,
    type SearchInvoicesResponse,
    type ManualInvoiceFormState
} from './actions';
import { useToast } from '@/hooks/use-toast';
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from 'date-fns';
import { cn } from '@/lib/utils';


export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authIsLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [sourceInvoices, setSourceInvoices] = useState<Invoice[]>([]); // Raw invoices from fetch/search
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    fileName: '',
    vendor: '',
    categories: '',
    summary: '',
  });

  const [dateFilter, setDateFilter] = useState<{ from?: Date; to?: Date }>({
    from: undefined,
    to: undefined,
  });

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  const [isManualInvoiceFormOpen, setIsManualInvoiceFormOpen] = useState(false);

  const [manualFormState, manualFormActionDispatch, isManualFormPending] = useActionState(
    handleManualInvoiceEntry,
    undefined as ManualInvoiceFormState | undefined
  );

  useEffect(() => {
    if (!authIsLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authIsLoading, router]);

  const loadInvoices = useCallback(async () => {
    if (isAuthenticated && user?.id) {
      setInvoicesLoading(true);
      setIsSearching(false);
      const response: FetchInvoicesResponse = await fetchUserInvoices(user.id);
      if (response.error) {
        toast({
          title: 'Error Fetching Invoices',
          description: response.error,
          variant: 'destructive',
        });
        setSourceInvoices([]);
      } else if (response.invoices) {
        setSourceInvoices(response.invoices);
      }
      setInvoicesLoading(false);
    } else if (!authIsLoading && !isAuthenticated) {
      setSourceInvoices([]);
      setInvoicesLoading(false);
    }
  }, [isAuthenticated, user?.id, authIsLoading, toast]);

  useEffect(() => {
    if (!searchQuery) {
        loadInvoices();
    }
  }, [loadInvoices, searchQuery]);

  const handleSearchSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) {
      loadInvoices();
      return;
    }
    if (!user?.id) return;

    setIsSearching(true);
    setInvoicesLoading(true);
    const response: SearchInvoicesResponse = await searchInvoices(user.id, searchQuery);

    if (response.error) {
      toast({
        title: 'Search Failed',
        description: response.error,
        variant: 'destructive',
      });
      setSourceInvoices([]);
    } else if (response.invoices) {
      setSourceInvoices(response.invoices);
      if (response.invoices.length === 0) {
        toast({
          title: 'No Results',
          description: 'No invoices matched your search query.',
          variant: 'default',
        });
      }
    }
    setColumnFilters({ fileName: '', vendor: '', categories: '', summary: '' }); // Reset column filters on new search
    setDateFilter({ from: undefined, to: undefined }); // Reset date filter on new search
    setIsSearching(false);
    setInvoicesLoading(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    // loadInvoices will be called by useEffect due to searchQuery change
  };

  const handleNewInvoiceAdded = useCallback((newInvoice: Invoice) => {
    setSourceInvoices((prevInvoices) => {
      const existingInvoiceIndex = prevInvoices.findIndex(inv => inv.id === newInvoice.id);
      let updatedInvoices;

      if (existingInvoiceIndex !== -1) {
        // Invoice with the same ID exists, replace it
        updatedInvoices = [...prevInvoices];
        updatedInvoices[existingInvoiceIndex] = newInvoice;
      } else {
        // Invoice is new, add it to the beginning
        updatedInvoices = [newInvoice, ...prevInvoices];
      }
      // Sort all invoices by uploadedAt date descending
      return updatedInvoices.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    });

    if (searchQuery) {
         toast({
            title: 'Invoice Added/Updated',
            description: `${newInvoice.fileName} processed. Your current view might be filtered. Clear filters to see all changes.`,
            variant: 'default'
         })
    }
  }, [searchQuery, toast]);


  const handleLogout = async () => {
    await logout();
  };

  const openDeleteConfirmDialog = (invoice: Invoice) => {
    setInvoiceToDelete(invoice);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!invoiceToDelete || !user?.id) return;

    const response: SoftDeleteResponse = await softDeleteInvoice(invoiceToDelete.id, user.id);
    if (response.success && response.deletedInvoiceId) {
      setSourceInvoices((prevInvoices) => prevInvoices.filter((inv) => inv.id !== response.deletedInvoiceId));
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

  const handleColumnFilterChange = (columnId: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [columnId]: value }));
  };

  const displayedInvoices = useMemo(() => {
    let filtered = [...sourceInvoices]; // Start with a copy of source invoices

    // Apply column filters
    Object.entries(columnFilters).forEach(([key, val]) => {
      if (val.length > 0) {
        const filterValue = val.toLowerCase();
        filtered = filtered.filter(invoice => {
          if (key === 'categories') {
            return invoice.categories?.some(cat => cat.toLowerCase().includes(filterValue)) ?? false;
          }
           if (key === 'summary') {
            return invoice.summary?.toLowerCase().includes(filterValue) ?? false;
          }
          const invoiceValue = (invoice as any)[key]?.toString().toLowerCase() ?? '';
          return invoiceValue.includes(filterValue);
        });
      }
    });

    // Apply date filter
    if (dateFilter.from || dateFilter.to) {
      filtered = filtered.filter(invoice => {
        if (!invoice.date) return false;

        const dateParts = invoice.date.split('-').map(Number);
        if (dateParts.length !== 3 || dateParts.some(isNaN)) {
            console.warn(`Invalid date format for invoice ID ${invoice.id}: ${invoice.date}`);
            return false;
        }
        const invoiceDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));

        let passesFrom = true;
        if (dateFilter.from) {
          const filterFromDate = new Date(Date.UTC(dateFilter.from.getFullYear(), dateFilter.from.getMonth(), dateFilter.from.getDate()));
          passesFrom = invoiceDate.getTime() >= filterFromDate.getTime();
        }

        let passesTo = true;
        if (dateFilter.to) {
          const filterToDate = new Date(Date.UTC(dateFilter.to.getFullYear(), dateFilter.to.getMonth(), dateFilter.to.getDate()));
          passesTo = invoiceDate.getTime() <= filterToDate.getTime();
        }
        return passesFrom && passesTo;
      });
    }

    return filtered;
  }, [sourceInvoices, columnFilters, dateFilter]);

  const hasActiveColumnFilters = useMemo(() => Object.values(columnFilters).some(val => val.length > 0), [columnFilters]);
  const hasActiveDateFilters = useMemo(() => !!dateFilter.from || !!dateFilter.to, [dateFilter]);
  const hasActiveFilters = hasActiveColumnFilters || hasActiveDateFilters;

  const handleClearFilters = () => {
    setColumnFilters({ fileName: '', vendor: '', categories: '', summary: '' });
    setDateFilter({ from: undefined, to: undefined });
  };


  if (authIsLoading && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
       <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <p className="text-lg text-muted-foreground">Redirecting to login...</p>
        <Loader2 className="mt-4 h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
            <AppLogo iconSizeClass="h-7 w-7" textSizeClass="text-2xl" />
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  Welcome, {user.name || user.email}!
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout} disabled={authIsLoading}>
                {authIsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 container mx-auto max-w-screen-2xl p-4 md:p-8">
          <section className="mb-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
            <InvoiceUploadForm
              onInvoiceUploaded={handleNewInvoiceAdded}
              userId={user.id}
            />
            <Card className="w-full shadow-lg flex flex-col">
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2 text-2xl">
                        <PlusCircle className="h-6 w-6 text-primary" />
                        Manual Invoice Entry
                    </CardTitle>
                    <CardDescription>
                        No file to upload? Enter invoice details manually.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                    <Button onClick={() => setIsManualInvoiceFormOpen(true)} className="w-full md:w-auto">
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Manual Invoice
                    </Button>
                </CardContent>
            </Card>
             <Card className="w-full shadow-lg flex flex-col">
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2 text-2xl">
                        <BarChartHorizontalBig className="h-6 w-6 text-primary" />
                        Spending Insights
                    </CardTitle>
                    <CardDescription>
                        Analyze your spending patterns by category.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                    <Button asChild className="w-full md:w-auto">
                        <Link href="/dashboard/distribution">
                            <BarChartHorizontalBig className="mr-2 h-4 w-4" /> View Spending Distribution
                        </Link>
                    </Button>
                </CardContent>
            </Card>
             <Card className="w-full shadow-lg flex flex-col">
                <CardHeader>
                    <CardTitle className="font-headline flex items-center gap-2 text-2xl">
                        <CalendarDays className="h-6 w-6 text-primary" />
                        Monthly View
                    </CardTitle>
                    <CardDescription>
                        Browse invoices by specific month and year.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                    <Button asChild className="w-full md:w-auto">
                        <Link href="/dashboard/monthly">
                            <CalendarDays className="mr-2 h-4 w-4" /> View Monthly Invoices
                        </Link>
                    </Button>
                </CardContent>
            </Card>
          </section>

          {isManualInvoiceFormOpen && user?.id && (
            <ManualInvoiceForm
                userId={user.id}
                mode="create"
                onFormSuccess={handleNewInvoiceAdded}
                isOpen={isManualInvoiceFormOpen}
                onOpenChange={setIsManualInvoiceFormOpen}
                serverActionDispatch={manualFormActionDispatch}
                isActionPending={isManualFormPending}
                actionState={manualFormState}
            />
          )}

          <Separator className="my-8" />

          <section>
            <div className="mb-6 p-4 border rounded-lg bg-card shadow">
                <h3 className="text-lg font-semibold mb-4 text-card-foreground">Filter Invoices</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                    <form onSubmit={handleSearchSubmit} className="flex gap-2 items-center md:col-span-2 lg:col-span-1">
                        <Input
                            type="search"
                            placeholder="Search summaries, etc..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="flex-grow"
                            aria-label="Search invoices by keyword"
                        />
                        {searchQuery && (
                            <Button type="button" variant="ghost" size="icon" onClick={clearSearch} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                            <XCircle className="h-5 w-5" />
                            </Button>
                        )}
                        <Button type="submit" disabled={isSearching || invoicesLoading}>
                            {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            Search
                        </Button>
                    </form>

                    <div className="flex gap-2 items-center">
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !dateFilter.from && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateFilter.from ? format(dateFilter.from, "PPP") : <span>From date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            mode="single"
                            selected={dateFilter.from}
                            onSelect={(day) => setDateFilter(prev => ({ ...prev, from: day || undefined }))}
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !dateFilter.to && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateFilter.to ? format(dateFilter.to, "PPP") : <span>To date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                            mode="single"
                            selected={dateFilter.to}
                            onSelect={(day) => setDateFilter(prev => ({ ...prev, to: day || undefined }))}
                            disabled={(date) =>
                                dateFilter.from ? date < dateFilter.from : false
                            }
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                    </div>

                    {hasActiveFilters && (
                        <Button variant="outline" onClick={handleClearFilters} className="w-full md:w-auto lg:justify-self-start">
                            <FilterX className="mr-2 h-4 w-4" /> Clear All Filters
                        </Button>
                    )}
                </div>
            </div>


            {(invoicesLoading || isSearching) ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">{isSearching ? 'Searching invoices...' : 'Loading your invoices...'}</p>
              </div>
            ) : (
              <div className="animate-in fade-in-0 duration-500">
                <InvoiceList
                  invoices={displayedInvoices}
                  onDeleteInvoice={openDeleteConfirmDialog}
                  currentColumnFilters={columnFilters}
                  onColumnFilterChange={handleColumnFilterChange}
                />
              </div>
            )}
          </section>
        </main>

        <footer className="py-6 md:px-8 md:py-0 border-t border-border/40 max-w-screen-2xl mx-auto w-full">
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
