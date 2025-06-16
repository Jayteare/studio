
"use client";

import { useState, useEffect, useCallback, FormEvent, useActionState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InvoiceUploadForm } from '@/components/invoice-upload-form';
import { ManualInvoiceForm, type ManualInvoiceFormProps } from '@/components/manual-invoice-form';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, Search, XCircle, PlusCircle, BarChartHorizontalBig, CalendarDays } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { Separator } from '@/components/ui/separator';
import { 
    fetchUserInvoices, 
    softDeleteInvoice, 
    searchInvoices, 
    handleManualInvoiceEntry, // Import the server action
    type FetchInvoicesResponse, 
    type SoftDeleteResponse, 
    type SearchInvoicesResponse,
    type ManualInvoiceFormState // Import the state type
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

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authIsLoading, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  const [isManualInvoiceFormOpen, setIsManualInvoiceFormOpen] = useState(false);

  // useActionState for manual invoice entry (create mode)
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
      setIsSearching(false); // Reset search state
      const response: FetchInvoicesResponse = await fetchUserInvoices(user.id);
      if (response.error) {
        toast({
          title: 'Error Fetching Invoices',
          description: response.error,
          variant: 'destructive',
        });
        setInvoices([]);
      } else if (response.invoices) {
        setInvoices(response.invoices);
      }
      setInvoicesLoading(false);
    } else if (!authIsLoading && !isAuthenticated) {
      setInvoices([]);
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
      setInvoices([]); 
    } else if (response.invoices) {
      setInvoices(response.invoices);
      if (response.invoices.length === 0) {
        toast({
          title: 'No Results',
          description: 'No invoices matched your search query.',
          variant: 'default',
        });
      }
    }
    setIsSearching(false);
    setInvoicesLoading(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleNewInvoiceAdded = useCallback((newInvoice: Invoice) => {
    if (searchQuery) {
         setInvoices((prevInvoices) => [newInvoice, ...prevInvoices].sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
         toast({
            title: 'Invoice Added',
            description: `${newInvoice.fileName} is added. Your current view might be filtered by search. Clear search to see all.`,
            variant: 'default'
         })
    } else {
        setInvoices((prevInvoices) => [newInvoice, ...prevInvoices].sort((a,b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()));
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
      setInvoices((prevInvoices) => prevInvoices.filter((inv) => inv.id !== response.deletedInvoiceId));
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
            <form onSubmit={handleSearchSubmit} className="mb-8 flex gap-2 items-center">
              <Input
                type="search"
                placeholder="Search invoice summaries (e.g., 'office supplies from ACME')"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-grow"
                aria-label="Search invoices"
              />
              {searchQuery && (
                <Button type="button" variant="ghost" size="icon" onClick={clearSearch} aria-label="Clear search">
                  <XCircle className="h-5 w-5" />
                </Button>
              )}
              <Button type="submit" disabled={isSearching || invoicesLoading}>
                {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search
              </Button>
            </form>

            {(invoicesLoading || isSearching) ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">{isSearching ? 'Searching invoices...' : 'Loading your invoices...'}</p>
              </div>
            ) : (
              <div className="animate-in fade-in-0 duration-500">
                <InvoiceList 
                  invoices={invoices} 
                  onDeleteInvoice={openDeleteConfirmDialog} 
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

