
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

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading: authIsLoading, logout } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientIsLoading, setClientIsLoading] = useState(true);

  useEffect(() => {
    if (!authIsLoading) {
      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        // Simulate fetching initial invoices or load from local storage if desired
        // For now, starts with an empty list.
        // TODO: Fetch invoices for the current user from MongoDB
        setClientIsLoading(false);
      }
    }
  }, [isAuthenticated, authIsLoading, router]);

  const handleInvoiceUploaded = useCallback((newInvoice: Invoice) => {
    setInvoices((prevInvoices) => [newInvoice, ...prevInvoices]);
  }, []);

  const handleLogout = async () => {
    await logout();
    // Navigation to /login is handled by logout() in auth-context
  };

  if (authIsLoading || clientIsLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Dashboard...</p>
      </div>
    );
  }
  
  if (!isAuthenticated || !user) { // Added !user check for type safety
     // This case should ideally be caught by the useEffect redirect,
     // but as a fallback or if loading state logic changes:
    return (
       <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <p className="text-lg text-muted-foreground">Redirecting to login...</p>
        <Loader2 className="mt-4 h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
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
          <InvoiceList invoices={invoices} />
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
  );
}
