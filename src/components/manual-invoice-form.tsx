
"use client";

import React, { useEffect, useActionState } from 'react';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ManualInvoiceEntrySchema, type ManualInvoiceEntryData } from '@/types/invoice-form';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, PlusCircle, Save, Trash2, CalendarIcon, DollarSign, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';


export interface ManualInvoiceFormProps {
  userId: string;
  mode: 'create' | 'edit';
  invoiceToEdit?: Invoice | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  serverAction: (formData: FormData) => Promise<any>; 
  isActionPending: boolean;
  onFormSuccess?: (invoice: Invoice) => void; 
}

type FormData = ManualInvoiceEntryData;


export function ManualInvoiceForm({
    userId,
    mode,
    invoiceToEdit,
    isOpen,
    onOpenChange,
    serverAction,
    isActionPending,
    onFormSuccess
}: ManualInvoiceFormProps) {
  const { toast } = useToast();

  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting: isRHFSubmitting },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(ManualInvoiceEntrySchema),
    defaultValues: {
      userId: userId,
      invoiceId: mode === 'edit' && invoiceToEdit ? invoiceToEdit.id : undefined,
      vendor: mode === 'edit' && invoiceToEdit ? invoiceToEdit.vendor : '',
      date: mode === 'edit' && invoiceToEdit?.date
            ? format(parseISO(invoiceToEdit.date), 'yyyy-MM-dd')
            : new Date().toISOString().split('T')[0],
      total: mode === 'edit' && invoiceToEdit ? invoiceToEdit.total : 0,
      lineItems: mode === 'edit' && invoiceToEdit?.lineItems && invoiceToEdit.lineItems.length > 0
                 ? invoiceToEdit.lineItems.map(li => ({ description: li.description, amount: li.amount }))
                 : [{ description: '', amount: 0 }],
      isMonthlyRecurring: mode === 'edit' && invoiceToEdit ? invoiceToEdit.isLikelyRecurring || false : false,
      categoriesString: mode === 'edit' && invoiceToEdit?.categories?.length
                        ? invoiceToEdit.categories.join(', ')
                        : '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems',
  });

  const lineItems = watch('lineItems');

  useEffect(() => {
    const newTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    setValue('total', newTotal, { shouldValidate: true });
  }, [lineItems, setValue]);


  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && invoiceToEdit) {
        const editDate = invoiceToEdit.date
            ? format(parseISO(invoiceToEdit.date), 'yyyy-MM-dd')
            : new Date().toISOString().split('T')[0];
        reset({
          userId: userId,
          invoiceId: invoiceToEdit.id,
          vendor: invoiceToEdit.vendor,
          date: editDate,
          total: invoiceToEdit.total,
          lineItems: invoiceToEdit.lineItems && invoiceToEdit.lineItems.length > 0
                     ? invoiceToEdit.lineItems.map(li => ({ description: li.description, amount: li.amount }))
                     : [{ description: '', amount: 0 }],
          isMonthlyRecurring: invoiceToEdit.isLikelyRecurring || false,
          categoriesString: invoiceToEdit.categories?.join(', ') || '',
        });
      } else if (mode === 'create') {
        reset({
          userId: userId,
          invoiceId: undefined,
          vendor: '',
          date: new Date().toISOString().split('T')[0],
          total: 0,
          lineItems: [{ description: '', amount: 0 }],
          isMonthlyRecurring: false,
          categoriesString: '',
        });
      }
    }
  }, [mode, invoiceToEdit, reset, userId, isOpen]);


  const processForm = async (data: FormData) => {
    const formDataPayload = new FormData();
    formDataPayload.append('userId', data.userId);
    if (mode === 'edit' && data.invoiceId) {
        formDataPayload.append('invoiceId', data.invoiceId);
    }
    formDataPayload.append('vendor', data.vendor);
    formDataPayload.append('invoiceDate', data.date);
    formDataPayload.append('total', data.total.toString());
    data.lineItems.forEach((item, index) => {
      formDataPayload.append(`lineItems[${index}].description`, item.description);
      formDataPayload.append(`lineItems[${index}].amount`, item.amount.toString());
    });
    formDataPayload.append('isMonthlyRecurring', data.isMonthlyRecurring ? 'true' : 'false');
    formDataPayload.append('categoriesString', data.categoriesString || '');


    React.startTransition(() => {
      serverAction(formDataPayload).then(actionResult => {
        if (actionResult?.error) {
          toast({
            title: mode === 'edit' ? 'Update Failed' : 'Save Failed',
            description: actionResult.error,
            variant: 'destructive',
          });
        }
        if (actionResult?.invoice) {
          toast({
            title: mode === 'edit' ? 'Invoice Updated' : 'Invoice Saved',
            description: actionResult.message || `${actionResult.invoice.vendor} details saved.`,
            variant: 'default',
          });
          if (onFormSuccess) {
            onFormSuccess(actionResult.invoice);
          }
          onOpenChange(false);
        }
      });
    });
  };

  const dialogTitle = mode === 'edit' ? 'Edit Invoice' : 'Add Manual Invoice';
  const dialogDescription = mode === 'edit'
    ? 'Update the details for this invoice. AI-generated fields (summary, categories, recurrence) will be re-processed. You can manually set categories below.'
    : 'Enter the details for an invoice manually. Mark if it\'s a recurring monthly expense. Provide categories or let AI suggest them.';
  const submitButtonText = mode === 'edit' ? 'Save Changes' : 'Save Invoice';
  const SubmitIcon = mode === 'edit' ? Edit : Save;

  const isFormSubmitting = isRHFSubmitting || isActionPending;


  return (
    <Dialog open={isOpen} onOpenChange={
        (open) => {
            if(!open && mode === 'create') { // Reset create form on close if it wasn't submitted
                 reset({
                    userId: userId,
                    invoiceId: undefined,
                    vendor: '',
                    date: new Date().toISOString().split('T')[0],
                    total: 0,
                    lineItems: [{ description: '', amount: 0 }],
                    isMonthlyRecurring: false,
                    categoriesString: '',
                });
            }
            onOpenChange(open);
        }
    }>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(processForm)}>
          <ScrollArea className="h-[60vh] pr-6">
            <div className="space-y-6 p-1">
              <input type="hidden" {...register('userId')} value={userId} />
              {mode === 'edit' && invoiceToEdit && (
                <input type="hidden" {...register('invoiceId')} value={invoiceToEdit.id} />
              )}

              <div>
                <Label htmlFor="vendor">Vendor Name</Label>
                <Input id="vendor" {...register('vendor')} placeholder="e.g., Netflix, AWS" />
                {errors.vendor && <p className="text-sm text-destructive mt-1">{errors.vendor.message}</p>}
              </div>

              <div>
                <Label htmlFor="date">Invoice Date</Label>
                 <Controller
                    name="date"
                    control={control}
                    render={({ field }) => (
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !field.value && "text-muted-foreground"
                            )}
                            >
                             <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(parseISO(field.value), "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                            mode="single"
                            selected={field.value ? parseISO(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                    )}
                    />
                {errors.date && <p className="text-sm text-destructive mt-1">{errors.date.message}</p>}
              </div>

              <div className="flex items-center space-x-2">
                <Controller
                    name="isMonthlyRecurring"
                    control={control}
                    render={({ field }) => (
                        <Checkbox
                        id="isMonthlyRecurring"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        />
                    )}
                />
                <Label htmlFor="isMonthlyRecurring" className="text-sm font-normal cursor-pointer">
                    This is a recurring monthly expense
                </Label>
                 {errors.isMonthlyRecurring && <p className="text-sm text-destructive mt-1">{errors.isMonthlyRecurring.message}</p>}
              </div>

              {/* Categories Input Field */}
              <div>
                <Label htmlFor="categoriesString">Categories (comma-separated)</Label>
                <Input
                  id="categoriesString"
                  {...register('categoriesString')}
                  placeholder="e.g., Software, Office Supplies, Travel"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to let AI suggest categories.
                </p>
                {errors.categoriesString && <p className="text-sm text-destructive mt-1">{errors.categoriesString.message}</p>}
              </div>

              <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Line Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2 border-b pb-2 last:border-b-0">
                        <div className="flex-grow space-y-1">
                        <Label htmlFor={`lineItems[${index}].description`} className="sr-only">Description</Label>
                        <Input
                            {...register(`lineItems.${index}.description`)}
                            placeholder="Item description"
                            className="text-sm"
                        />
                        {errors.lineItems?.[index]?.description && (
                            <p className="text-xs text-destructive">{errors.lineItems[index]?.description?.message}</p>
                        )}
                        </div>
                        <div className="w-1/3 space-y-1 relative flex items-center">
                            <Label htmlFor={`lineItems[${index}].amount`} className="sr-only">Amount</Label>
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                type="number"
                                step="0.01"
                                {...register(`lineItems.${index}.amount`, { valueAsNumber: true })}
                                placeholder="Amount"
                                className="text-sm pl-7" // Added pl-7 for DollarSign
                            />
                        {errors.lineItems?.[index]?.amount && (
                            <p className="text-xs text-destructive">{errors.lineItems[index]?.amount?.message}</p>
                        )}
                        </div>
                        <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                        className="text-destructive hover:text-destructive/80 shrink-0"
                        >
                        <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                    ))}
                    <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ description: '', amount: 0 })}
                    className="mt-2"
                    >
                    <PlusCircle className="mr-2 h-4 w-4" /> Add Line Item
                    </Button>
                    {errors.lineItems && typeof errors.lineItems === 'object' && 'message' in errors.lineItems && (
                        <p className="text-sm text-destructive mt-1">{errors.lineItems.message}</p>
                    )}
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="total">Total Amount</Label>
                <div className="relative flex items-center">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                      id="total"
                      type="number"
                      step="0.01"
                      {...register('total', { valueAsNumber: true })}
                      placeholder="0.00"
                      className="font-semibold pl-7" // Added pl-7 for DollarSign
                      readOnly 
                  />
                </div>
                {errors.total && <p className="text-sm text-destructive mt-1">{errors.total.message}</p>}
              </div>

            </div>
          </ScrollArea>
          <DialogFooter className="pt-6">
            <DialogClose asChild>
                <Button type="button" variant="outline" onClick={() => {
                    onOpenChange(false);
                    }}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isFormSubmitting}>
              {isFormSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <SubmitIcon className="mr-2 h-4 w-4" />
                  {submitButtonText}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

