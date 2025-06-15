
"use client";

import { useEffect, useActionState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { handleManualInvoiceEntry, type ManualInvoiceFormState } from '@/app/dashboard/actions';
import { ManualInvoiceEntrySchema, type ManualInvoiceEntryData } from '@/types/invoice-form';
import type { Invoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, PlusCircle, Save, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';


export interface ManualInvoiceFormProps {
  userId: string;
  onInvoiceAdded: (invoice: Invoice) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormData = ManualInvoiceEntryData;

function SubmitButton() {
  // react-hook-form's formState.isSubmitting can be used if not using useActionState directly with form
  // For useActionState, pending comes from the action state hook directly if we pass it.
  // Since we are using react-hook-form for submission handling before calling server action,
  // we'll use its `formState.isSubmitting`.
  const { formState: { isSubmitting } } = useForm<FormData>();
  return (
    <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
      {isSubmitting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Save className="mr-2 h-4 w-4" />
          Save Invoice
        </>
      )}
    </Button>
  );
}


export function ManualInvoiceForm({ userId, onInvoiceAdded, isOpen, onOpenChange }: ManualInvoiceFormProps) {
  const { toast } = useToast();
  const [actionState, formAction, isPending] = useActionState(handleManualInvoiceEntry, undefined);

  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting },
    setValue,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(ManualInvoiceEntrySchema),
    defaultValues: {
      userId: userId,
      vendor: '',
      date: new Date().toISOString().split('T')[0], // Default to today
      total: 0,
      lineItems: [{ description: '', amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems',
  });
  
  const lineItemsWatch = watch('lineItems'); // For calculating total

  useEffect(() => {
    const calculatedTotal = lineItemsWatch.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    setValue('total', calculatedTotal, { shouldValidate: true });
  }, [lineItemsWatch, setValue]);


  useEffect(() => {
    if (actionState?.error) {
      toast({
        title: 'Save Failed',
        description: actionState.error,
        variant: 'destructive',
      });
      // If actionState.errors (field-specific from Zod) exists, RHF errors will show them
    }
    if (actionState?.invoice) {
      toast({
        title: 'Invoice Saved',
        description: actionState.message || `Manual invoice for ${actionState.invoice.vendor} saved.`,
        variant: 'default',
      });
      onInvoiceAdded(actionState.invoice);
      reset(); // Reset form fields
      onOpenChange(false); // Close dialog
    }
  }, [actionState, toast, onInvoiceAdded, reset, onOpenChange]);

  const processForm = async (data: FormData) => {
    const formData = new FormData();
    formData.append('userId', data.userId);
    formData.append('vendor', data.vendor);
    formData.append('invoiceDate', data.date); // Ensure this matches action's expected field name
    formData.append('total', data.total.toString());
    data.lineItems.forEach((item, index) => {
      formData.append(`lineItems[${index}].description`, item.description);
      formData.append(`lineItems[${index}].amount`, item.amount.toString());
    });
    formAction(formData);
  };
  

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Manual Invoice</DialogTitle>
          <DialogDescription>
            Enter the details for an invoice manually. Useful for recurring subscriptions or receipts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(processForm)}>
          <ScrollArea className="h-[60vh] pr-6">
            <div className="space-y-6 p-1">
              <input type="hidden" {...register('userId')} value={userId} />

              <div>
                <Label htmlFor="vendor">Vendor Name</Label>
                <Input id="vendor" {...register('vendor')} placeholder="e.g., Netflix, AWS" />
                {errors.vendor && <p className="text-sm text-destructive mt-1">{errors.vendor.message}</p>}
                {actionState?.errors?.vendor && <p className="text-sm text-destructive mt-1">{actionState.errors.vendor.join(', ')}</p>}
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
                            {field.value ? format(new Date(field.value), "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                            mode="single"
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                    )}
                    />
                {errors.date && <p className="text-sm text-destructive mt-1">{errors.date.message}</p>}
                {actionState?.errors?.date && <p className="text-sm text-destructive mt-1">{actionState.errors.date.join(', ')}</p>}
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
                         {actionState?.errors?.[`lineItems.${index}.description` as const] && (
                            <p className="text-xs text-destructive">{actionState.errors[`lineItems.${index}.description` as const]!.join(', ')}</p>
                        )}
                        </div>
                        <div className="w-1/4 space-y-1">
                        <Label htmlFor={`lineItems[${index}].amount`} className="sr-only">Amount</Label>
                        <Input
                            type="number"
                            step="0.01"
                            {...register(`lineItems.${index}.amount`, { valueAsNumber: true })}
                            placeholder="Amount"
                            className="text-sm"
                        />
                        {errors.lineItems?.[index]?.amount && (
                            <p className="text-xs text-destructive">{errors.lineItems[index]?.amount?.message}</p>
                        )}
                        {actionState?.errors?.[`lineItems.${index}.amount` as const] && (
                            <p className="text-xs text-destructive">{actionState.errors[`lineItems.${index}.amount` as const]!.join(', ')}</p>
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
                    {actionState?.errors?.lineItems && typeof actionState.errors.lineItems === 'string' &&(
                         <p className="text-sm text-destructive mt-1">{actionState.errors.lineItems}</p>
                    )}
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="total">Total Amount</Label>
                <Input id="total" type="number" step="0.01" {...register('total', { valueAsNumber: true })} placeholder="0.00" readOnly className="font-semibold bg-muted" />
                {errors.total && <p className="text-sm text-destructive mt-1">{errors.total.message}</p>}
                {actionState?.errors?.total && <p className="text-sm text-destructive mt-1">{actionState.errors.total.join(', ')}</p>}
              </div>

            </div>
          </ScrollArea>
          <DialogFooter className="pt-6">
            <DialogClose asChild>
                <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false);}}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || isPending}>
              {(isSubmitting || isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

