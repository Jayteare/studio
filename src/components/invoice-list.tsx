
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
import { format, parseISO, isValid } from 'date-fns';
import Link from 'next/link';

interface InvoiceListProps {
  invoices: Invoice[];
  onDeleteInvoice: (invoice: Invoice) => void;
}

export function InvoiceList({ invoices, onDeleteInvoice }: InvoiceListProps) {
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';

    try {
        let date: Date;

        // 1. Prioritize YYYY-MM-DD as local day
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [yearStr, monthStr, dayStr] = dateString.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10) - 1; // month is 0-indexed for new Date()
            const day = parseInt(dayStr, 10);
            date = new Date(year, month, day);
        }
        // 2. Try parseISO for full ISO strings (e.g., with timezones)
        else {
            const parsed = parseISO(dateString);
            if (isValid(parsed)) {
                date = parsed;
            }
            // 3. Try common formats like MM/DD/YYYY if others fail
            else {
                const commonFormatParts = dateString.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
                if (commonFormatParts) {
                    let year = parseInt(commonFormatParts[3], 10);
                    // Basic heuristic for 2-digit years, assuming 21st century
                    if (year < 100) year += 2000;
                    const month = parseInt(commonFormatParts[1], 10) - 1;
                    const day = parseInt(commonFormatParts[2], 10);
                    date = new Date(year, month, day);
                } else {
                    // 4. Last resort: direct new Date() and hope for the best
                    date = new Date(dateString);
                }
            }
        }

        // Final validation and formatting
        if (isValid(date)) {
            return format(date, 'MMM dd, yyyy');
        } else {
            console.warn(`Could not parse date string with any known method: ${dateString}. Displaying as is.`);
            return dateString;
        }
    } catch (error) {
        console.warn(`Error formatting date: ${dateString}`, error);
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
