
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
import { Button } from '@/components/ui/button';
import { FileText, CalendarDays, CircleDollarSign, MessageSquareText, Info, Trash2, Settings, FileIcon, Tag } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface InvoiceListProps {
  invoices: Invoice[];
  onDeleteInvoice: (invoice: Invoice) => void;
}

export function InvoiceList({ invoices, onDeleteInvoice }: InvoiceListProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) { 
        const parts = dateString.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
        if(parts) {
            let year = parseInt(parts[3]);
            if (year < 100) year += 2000; // Basic year correction
            return format(new Date(year, parseInt(parts[1])-1, parseInt(parts[2])), 'MMM dd, yyyy');
        }
        return dateString; // Return original if parsing fails
      }
      return format(date, 'MMM dd, yyyy');
    } catch (error) {
      console.warn(`Could not parse date: ${dateString}`);
      return dateString;
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
          <Table className="table-fixed">
            <TableCaption>A list of your recently processed invoices. Click on a file name for details.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%] min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <FileIcon className="h-4 w-4" /> File Name
                  </div>
                </TableHead>
                <TableHead className="w-[15%] min-w-[150px]">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Vendor
                  </div>
                </TableHead>
                <TableHead className="w-[10%] min-w-[110px]">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" /> Date
                  </div>
                </TableHead>
                <TableHead className="text-right w-[10%] min-w-[120px]">
                  <div className="flex items-center justify-end gap-2">
                    <CircleDollarSign className="h-4 w-4" /> Total
                  </div>
                </TableHead>
                <TableHead className="w-[15%] min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" /> Categories
                  </div>
                </TableHead>
                <TableHead className="w-[20%] min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" /> Summary Insight
                  </div>
                </TableHead>
                 <TableHead className="w-[10%] min-w-[120px]">Uploaded</TableHead>
                 <TableHead className="w-[5%] min-w-[80px] text-center">
                    <div className="flex items-center justify-center gap-2">
                        <Settings className="h-4 w-4" /> Actions
                    </div>
                 </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium truncate">
                    <Link href={`/dashboard/invoice/${invoice.id}`} className="hover:underline text-primary" title={invoice.fileName}>
                      {invoice.fileName}
                    </Link>
                  </TableCell>
                  <TableCell className="truncate font-medium">{invoice.vendor}</TableCell>
                  <TableCell>{formatDate(invoice.date)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatCurrency(invoice.total)}</TableCell>
                  <TableCell>
                    {invoice.categories && invoice.categories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {invoice.categories.map((category, index) => (
                          <Badge key={index} variant="secondary" className="truncate">{category}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate hover:overflow-visible hover:whitespace-normal hover:text-clip" title={invoice.summary}>
                     {invoice.summary}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{format(new Date(invoice.uploadedAt), 'MMM dd, yyyy')}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onDeleteInvoice(invoice)}
                      aria-label="Delete invoice"
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
