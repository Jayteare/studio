"use client";

import type { Invoice } from '@/types/invoice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { FileText, CalendarDays, CircleDollarSign, MessageSquareText, Info } from 'lucide-react';
import { format } from 'date-fns';

interface InvoiceListProps {
  invoices: Invoice[];
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  const formatDate = (dateString: string) => {
    try {
      // Attempt to parse the date. If it's already a simple date like "MM/DD/YYYY", it might pass.
      // For more robust parsing, especially with varied formats from AI, a library like date-fns-tz might be needed.
      const date = new Date(dateString);
      if (isNaN(date.getTime())) { // Check if date is valid
        // If parsing fails, return original string or a placeholder
        // The AI might return dates in various formats. Let's try to make YYYY-MM-DD or MM/DD/YYYY work.
        const parts = dateString.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
        if(parts) {
            // Assuming MM/DD/YYYY or MM-DD-YYYY format
            let year = parseInt(parts[3]);
            if (year < 100) year += 2000; // handle YY format
            return format(new Date(year, parseInt(parts[1])-1, parseInt(parts[2])), 'MMM dd, yyyy');
        }
        return dateString; // Fallback to original string if parsing fails
      }
      return format(date, 'MMM dd, yyyy');
    } catch (error) {
      console.warn(`Could not parse date: ${dateString}`);
      return dateString; // Fallback for unparseable dates
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  if (invoices.length === 0) {
    return (
      <Card className="mt-8 w-full shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2 text-2xl">
            <Info className="h-6 w-6 text-primary" />
            Invoice History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-lg text-muted-foreground">
            No invoices have been processed yet. Upload an invoice to see it here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 w-full shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline text-2xl">Processed Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border">
          <Table>
            <TableCaption>A list of your recently processed invoices.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Vendor
                  </div>
                </TableHead>
                <TableHead className="w-[150px]">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Date
                  </div>
                </TableHead>
                <TableHead className="text-right w-[120px]">
                  <div className="flex items-center justify-end gap-2">
                    <CircleDollarSign className="h-4 w-4" /> Total
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" /> Summary Insight
                  </div>
                </TableHead>
                 <TableHead className="w-[150px]">Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.vendor}</TableCell>
                  <TableCell>{formatDate(invoice.date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(invoice.total)}</TableCell>
                  <TableCell className="max-w-xs truncate hover:whitespace-normal hover:text-clip" title={invoice.summary}>
                     <p className="text-sm text-muted-foreground">{invoice.summary}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{format(new Date(invoice.uploadedAt), 'MMM dd, yyyy')}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
