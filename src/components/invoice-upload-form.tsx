
"use client";

import { useEffect, useRef, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { handleInvoiceUpload, type UploadInvoiceFormState } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, UploadCloud, FileUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Invoice } from '@/types/invoice'; // Invoice type for onInvoiceUploaded

interface InvoiceUploadFormProps {
  onInvoiceUploaded: (invoice: Invoice) => void; // Use specific Invoice type
  userId: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <FileUp className="mr-2 h-4 w-4" />
          Upload & Process Invoice
        </>
      )}
    </Button>
  );
}

export function InvoiceUploadForm({ onInvoiceUploaded, userId }: InvoiceUploadFormProps) {
  const initialState: UploadInvoiceFormState | undefined = undefined;
  const [state, formAction] = useActionState(handleInvoiceUpload, initialState);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.error) {
      toast({
        title: 'Upload Failed',
        description: state.error,
        variant: 'destructive',
      });
    }
    if (state?.invoice) {
      toast({
        title: 'Upload Successful',
        description: state.message || `${state.invoice.fileName} processed.`,
        variant: 'default', // Keep default for success
      });
      onInvoiceUploaded(state.invoice);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset file input
      }
    }
  }, [state, toast, onInvoiceUploaded]);

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2 text-2xl">
          <UploadCloud className="h-6 w-6 text-primary" />
          Upload New Invoice
        </CardTitle>
        <CardDescription>
          Select a PDF or image file of an invoice to extract data and generate insights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor="invoiceFile" className="text-base">Invoice File</Label>
            <Input
              id="invoiceFile"
              name="invoiceFile"
              type="file"
              ref={fileInputRef}
              required
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="file:mr-4 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
            />
            <p className="text-sm text-muted-foreground">
              Supported formats: PDF, JPG, PNG, WEBP. Max size: 10MB.
            </p>
          </div>
          <div className="flex justify-end">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
