
"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart as BarChartIcon, ArrowLeft, Loader2, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { fetchSpendingDistribution, type SpendingByCategory, type FetchSpendingDistributionResponse } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLogo } from '@/components/app-logo';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"


export default function SpendingDistributionPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [spendingData, setSpendingData] = useState<SpendingByCategory[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSpendingData = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      if (!authIsLoading && !isAuthenticated) {
        router.replace('/login');
      }
      setIsLoadingData(false);
      return;
    }

    setIsLoadingData(true);
    setError(null);
    const response: FetchSpendingDistributionResponse = await fetchSpendingDistribution(user.id);

    if (response.error) {
      setError(response.error);
      toast({
        title: 'Error Fetching Spending Data',
        description: response.error,
        variant: 'destructive',
      });
      setSpendingData([]);
    } else if (response.data) {
      setSpendingData(response.data);
    } else {
      setSpendingData([]); // No data but no error
    }
    setIsLoadingData(false);
  }, [user?.id, isAuthenticated, authIsLoading, router, toast]);

  useEffect(() => {
    loadSpendingData();
  }, [loadSpendingData]);

  const formatCurrency = (amount?: number) => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  const chartConfig = {
    totalSpent: {
      label: "Total Spent",
      color: "hsl(var(--primary))",
    },
  } satisfies Record<string, { label: string; color: string }>;


  if (authIsLoading || (isLoadingData && !spendingData.length && !error) ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Spending Distribution...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 max-w-screen-2xl items-center justify-between">
          <AppLogo iconSizeClass="h-7 w-7" textSizeClass="text-2xl" />
          <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto max-w-4xl p-4 md:p-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-3xl mb-1 flex items-center gap-2">
              <BarChartIcon className="h-7 w-7 text-primary" />
              Spending Distribution by Category
            </CardTitle>
            <CardDescription>
              View a breakdown of your spending across different AI-suggested categories. 
              Note: If an invoice has multiple categories, its total amount contributes to each category listed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingData && spendingData.length === 0 && !error && (
                 <div className="flex flex-col items-center justify-center py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Calculating distribution...</p>
                </div>
            )}
            {error && !isLoadingData && (
              <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-6 rounded-md">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">Could not load spending data</p>
                <p className="text-center">{error}</p>
              </div>
            )}
            {!isLoadingData && !error && spendingData.length === 0 && (
              <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md">
                <Info className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">No Spending Data Available</p>
                <p className="text-center">Upload and categorize some invoices to see your spending distribution.</p>
              </div>
            )}
            {!isLoadingData && !error && spendingData.length > 0 && (
              <>
                <div className="h-[400px] w-full">
                   <ChartContainer config={chartConfig} className="h-full w-full">
                    <BarChart accessibilityLayer data={spendingData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="category"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        // tickFormatter={(value) => value.slice(0, 15) + (value.length > 15 ? '...' : '')} // Abbreviate long labels
                      />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        content={<ChartTooltipContent formatter={(value, name) => `${formatCurrency(value as number)}`} />}
                      />
                      <Legend />
                      <Bar dataKey="totalSpent" fill="var(--color-totalSpent)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
                
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Spending Summary Table</h3>
                   <div className="overflow-x-auto rounded-md border">
                    <table className="min-w-full divide-y divide-border">
                        <thead className="bg-muted/50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Category
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Total Spent
                            </th>
                        </tr>
                        </thead>
                        <tbody className="bg-background divide-y divide-border">
                        {spendingData.map((item) => (
                            <tr key={item.category}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">{item.category}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">{formatCurrency(item.totalSpent)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                   </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <footer className="py-6 md:px-8 md:py-0 border-t border-border/40 mt-auto">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-20 md:flex-row">
            <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
              © {new Date().getFullYear()} Invoice Insights. Your smart invoice assistant.
            </p>
          </div>
        </footer>
    </div>
  );
}
