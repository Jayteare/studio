
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { InvoiceUploadForm } from '@/components/invoice-upload-form';
import { InvoiceList } from '@/components/invoice-list';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { Separator } from '@/components/ui/separator';
import { fetchUserInvoices, softDeleteInvoice, type FetchInvoicesResponse, type SoftDeleteResponse } from './actions';
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

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);


  useEffect(() => {
    if (!authIsLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, authIsLoading, router]);

  const loadInvoices = useCallback(async () => {
    if (isAuthenticated && user?.id) {
      setInvoicesLoading(true);
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
    loadInvoices();
  }, [loadInvoices]);

  const handleInvoiceUploaded = useCallback((newInvoice: Invoice) => {
    setInvoices((prevInvoices) => [newInvoice, ...prevInvoices]);
  }, []);

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


  if (authIsLoading) {
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

        <main className="flex-1 container mx-auto max-w-5xl p-4 md:p-8">
          <section className="mb-12">
            <InvoiceUploadForm 
              onInvoiceUploaded={handleInvoiceUploaded} 
              userId={user.id} 
            />
          </section>
          
          <Separator className="my-8" />

          <section>
            {invoicesLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Loading your invoices...</p>
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

        <footer className="py-6 md:px-8 md:py-0 border-t border-border/40">
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
