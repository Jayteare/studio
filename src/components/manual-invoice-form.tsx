
"use client";

import React, { useEffect, useRef } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
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
import { format, parseISO, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

interface ManualInvoiceFormActionState {
  invoice?: Invoice;
  error?: string;
  message?: string;
  errors?: Partial<Record<keyof ManualInvoiceEntryData | string, string[]>>;
}

export interface ManualInvoiceFormProps {
  userId: string;
  mode: 'create' | 'edit';
  invoiceToEdit?: Invoice | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  serverActionDispatch: (formData: FormData) => void;
  isActionPending: boolean;
  actionState: ManualInvoiceFormActionState | undefined;
  onFormSuccess?: (invoice: Invoice) => void;
}

// Helper function to safely parse and format date string for form input
const getSafeFormDate = (dateString?: string): string => {
  const defaultFormattedDate = format(new Date(), 'yyyy-MM-dd');
  if (!dateString || typeof dateString !== 'string') {
    return defaultFormattedDate;
  }

  try {
    const parsedDate = parseISO(dateString);
    if (isValid(parsedDate)) {
      return format(parsedDate, 'yyyy-MM-dd');
    }
  } catch (e) {
    // parseISO failed
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Use UTC to avoid timezone shifts with new Date(y,m,d) during validation parts
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) {
      return dateString;
    }
  }
  
  const parts = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (parts) {
    const month = parseInt(parts[1], 10) -1; 
    const day = parseInt(parts[2], 10);
    let year = parseInt(parts[3], 10);
    if (year < 100) { 
        year += (new Date().getFullYear() - new Date().getFullYear() % 100 < year ? 1900 : 2000);
    }
    const parsedDate = new Date(year, month, day);
    if (isValid(parsedDate)) {
        return format(parsedDate, 'yyyy-MM-dd');
    }
  }

  console.warn(`Could not parse date string "${dateString}" into yyyy-MM-dd format. Defaulting to today.`);
  return defaultFormattedDate;
};

// Helper function to parse 'YYYY-MM-DD' string to a local Date object
function parseDateStringToLocalDay(dateString?: string): Date | undefined {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return undefined;
  }
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed for Date constructor
  const day = parseInt(parts[2], 10);

  const date = new Date(year, month, day); // Creates date with local timezone midnight

  if (isNaN(date.getTime())) return undefined;
  // Validate that the constructor parameters resulted in the same date
  if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
    return date;
  }
  return undefined;
}


export function ManualInvoiceForm({
    userId,
    mode,
    invoiceToEdit,
    isOpen,
    onOpenChange,
    serverActionDispatch,
    isActionPending,
    actionState,
    onFormSuccess
}: ManualInvoiceFormProps) {
  const { toast } = useToast();
  const processedActionStateRef = useRef<ManualInvoiceFormActionState | undefined>(undefined);

  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors: rhfErrors, isSubmitting: isRHFSubmitting },
    setValue,
    watch,
  } = useForm<ManualInvoiceEntryData>({
    resolver: zodResolver(ManualInvoiceEntrySchema),
    defaultValues: {
      userId: userId,
      invoiceId: mode === 'edit' && invoiceToEdit ? invoiceToEdit.id : undefined,
      vendor: mode === 'edit' && invoiceToEdit ? invoiceToEdit.vendor : '',
      date: mode === 'edit' && invoiceToEdit ? getSafeFormDate(invoiceToEdit.date) : getSafeFormDate(),
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
    const newTotal = lineItems.reduce((sum, item) => {
      let numericAmount = 0;
      // Prioritize direct number, then attempt parseFloat if it's a string
      if (typeof item.amount === 'number' && !isNaN(item.amount)) {
        numericAmount = item.amount;
      } else if (typeof item.amount === 'string') {
        const parsed = parseFloat(item.amount); // parseFloat('') is NaN
        if (!isNaN(parsed)) {
          numericAmount = parsed;
        }
      }
      // If item.amount was undefined or unparseable, numericAmount remains 0
      return sum + numericAmount;
    }, 0);
    setValue('total', Number(newTotal.toFixed(2)), { shouldValidate: false, shouldDirty: true, shouldTouch: false });
  }, [lineItems, setValue]);


  useEffect(() => {
    if (isOpen) {
      processedActionStateRef.current = undefined; // Reset when dialog opens
      if (mode === 'edit' && invoiceToEdit) {
        reset({
          userId: userId,
          invoiceId: invoiceToEdit.id,
          vendor: invoiceToEdit.vendor,
          date: getSafeFormDate(invoiceToEdit.date),
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
          date: getSafeFormDate(), 
          total: 0,
          lineItems: [{ description: '', amount: 0 }],
          isMonthlyRecurring: false,
          categoriesString: '',
        });
      }
    }
  }, [mode, invoiceToEdit, reset, userId, isOpen]);

  useEffect(() => {
    // Only process actionState if it's new and not while an action is pending
    if (isActionPending || !actionState || actionState === processedActionStateRef.current) {
      return;
    }
    
    processedActionStateRef.current = actionState; // Mark as processed for this specific state instance

    if (actionState.error) {
      toast({
        title: mode === 'edit' ? 'Update Failed' : 'Save Failed',
        description: actionState.error,
        variant: 'destructive',
      });
    } else if (actionState.invoice) {
      toast({
        title: mode === 'edit' ? 'Invoice Updated' : 'Invoice Saved',
        description: actionState.message || `${actionState.invoice.vendor} details saved.`,
        variant: 'default',
      });
      if (onFormSuccess) {
        onFormSuccess(actionState.invoice);
      }
      onOpenChange(false); // Close dialog on success
    }
  }, [actionState, isActionPending, mode, onFormSuccess, onOpenChange, toast]);


  const processForm = (data: ManualInvoiceEntryData) => {
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
      serverActionDispatch(formDataPayload);
    });
  };

  const dialogTitle = mode === 'edit' ? 'Edit Invoice' : 'Add Manual Invoice';
  const dialogDescription = mode === 'edit'
    ? 'Update the details for this invoice. User-provided categories will be saved. Summary and embeddings remain from original.'
    : 'Enter invoice details manually. Mark if recurring and optionally provide categories, or let AI suggest them.';
  const submitButtonText = mode === 'edit' ? 'Save Changes' : 'Save Invoice';
  const SubmitIcon = mode === 'edit' ? Edit : Save;

  const isFormSubmitting = isRHFSubmitting || isActionPending;

  return (
    <Dialog open={isOpen} onOpenChange={
        (open) => {
            if(!open && mode === 'create' && !actionState?.invoice && !isActionPending) { 
                 reset({
                    userId: userId,
                    invoiceId: undefined,
                    vendor: '',
                    date: getSafeFormDate(),
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
                {rhfErrors.vendor && <p className="text-sm text-destructive mt-1">{rhfErrors.vendor.message}</p>}
                {actionState?.errors?.vendor && <p className="text-sm text-destructive mt-1">{actionState.errors.vendor.join(', ')}</p>}
              </div>

              <div>
                <Label htmlFor="date">Invoice Date</Label>
                 <Controller
                    name="date"
                    control={control}
                    render={({ field }) => {
                        const dateForCalendar = field.value ? parseDateStringToLocalDay(field.value) : undefined;
                        return (
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
                                {dateForCalendar && isValid(dateForCalendar) ? format(dateForCalendar, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                mode="single"
                                selected={dateForCalendar}
                                onSelect={(selectedDay) => {
                                    field.onChange(selectedDay ? format(selectedDay, 'yyyy-MM-dd') : '');
                                }}
                                initialFocus
                                />
                            </PopoverContent>
                            </Popover>
                        );
                    }}
                    />
                {rhfErrors.date && <p className="text-sm text-destructive mt-1">{rhfErrors.date.message}</p>}
                {actionState?.errors?.date && <p className="text-sm text-destructive mt-1">{actionState.errors.date.join(', ')}</p>}
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
                 {rhfErrors.isMonthlyRecurring && <p className="text-sm text-destructive mt-1">{rhfErrors.isMonthlyRecurring.message}</p>}
                 {actionState?.errors?.isMonthlyRecurring && <p className="text-sm text-destructive mt-1">{actionState.errors.isMonthlyRecurring.join(', ')}</p>}
              </div>
              
              <div>
                <Label htmlFor="categoriesString">Categories (comma-separated)</Label>
                <Input
                  id="categoriesString"
                  {...register('categoriesString')}
                  placeholder="e.g., Software, Office Supplies, Travel"
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {mode === 'edit' ? 'Edit categories here. User-provided list replaces AI suggestions.' : 'Leave empty to let AI suggest categories.'}
                </p>
                {rhfErrors.categoriesString && <p className="text-sm text-destructive mt-1">{rhfErrors.categoriesString.message}</p>}
                {actionState?.errors?.categoriesString && <p className="text-sm text-destructive mt-1">{actionState.errors.categoriesString.join(', ')}</p>}
              </div>


              <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Line Items</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2 border-b pb-2 last:border-b-0">
                        <div className="flex-grow space-y-1">
                        <Label htmlFor={`lineItems.${index}.description`} className="sr-only">Description</Label>
                        <Input
                            {...register(`lineItems.${index}.description`)}
                            placeholder="Item description"
                            className="text-sm"
                        />
                        {rhfErrors.lineItems?.[index]?.description && (
                            <p className="text-xs text-destructive">{rhfErrors.lineItems[index]?.description?.message}</p>
                        )}
                        {actionState?.errors?.[`lineItems.${index}.description` as any] && <p className="text-xs text-destructive">{(actionState.errors[`lineItems.${index}.description` as any] as string[]).join(', ')}</p>}
                        </div>
                        <div className="w-1/3 space-y-1 relative flex items-center">
                            <Label htmlFor={`lineItems.${index}.amount`} className="sr-only">Amount</Label>
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                type="number"
                                step="0.01"
                                {...register(`lineItems.${index}.amount`, { valueAsNumber: true })}
                                placeholder="Amount"
                                className="text-sm pl-7"
                            />
                        {rhfErrors.lineItems?.[index]?.amount && (
                            <p className="text-xs text-destructive">{rhfErrors.lineItems[index]?.amount?.message}</p>
                        )}
                        {actionState?.errors?.[`lineItems.${index}.amount` as any] && <p className="text-xs text-destructive">{(actionState.errors[`lineItems.${index}.amount` as any] as string[]).join(', ')}</p>}
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
                    {rhfErrors.lineItems && typeof rhfErrors.lineItems === 'object' && !Array.isArray(rhfErrors.lineItems) && 'message' in rhfErrors.lineItems && ( 
                        <p className="text-sm text-destructive mt-1">{(rhfErrors.lineItems as any).message}</p>
                    )}
                     {actionState?.errors?.lineItems && Array.isArray(actionState.errors.lineItems) && typeof actionState.errors.lineItems[0] === 'string' && ( 
                        <p className="text-sm text-destructive mt-1">{actionState.errors.lineItems.join(', ')}</p>
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
                      className="font-semibold pl-7"
                      readOnly 
                  />
                </div>
                {rhfErrors.total && <p className="text-sm text-destructive mt-1">{rhfErrors.total.message}</p>}
                {actionState?.errors?.total && <p className="text-sm text-destructive mt-1">{actionState.errors.total.join(', ')}</p>}
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
    

    

    





