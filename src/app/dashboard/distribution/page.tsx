
"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BarChart as BarChartIcon, ArrowLeft, Loader2, AlertTriangle, Info, TrendingUp, Sigma, CalendarCheck2, BarChartHorizontalBig } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { 
    fetchSpendingDistribution, type SpendingByCategory, type FetchSpendingDistributionResponse,
    fetchSpendingAnalytics, type MonthlySpendingData, type OverallSpendingMetrics, type FetchSpendingAnalyticsResponse
} from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLogo } from '@/components/app-logo';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';


export default function SpendingDistributionPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();

  const [categorySpendingData, setCategorySpendingData] = useState<SpendingByCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlySpendingData[]>([]);
  const [overallMetrics, setOverallMetrics] = useState<OverallSpendingMetrics | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);


  const loadAllData = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      if (!authIsLoading && !isAuthenticated) {
        router.replace('/login');
      }
      setIsLoadingCategories(false);
      setIsLoadingAnalytics(false);
      return;
    }

    setIsLoadingCategories(true);
    setCategoryError(null);
    setIsLoadingAnalytics(true);
    setAnalyticsError(null);

    try {
      const [categoryResponse, analyticsResponse] = await Promise.all([
        fetchSpendingDistribution(user.id),
        fetchSpendingAnalytics(user.id)
      ]);

      if (categoryResponse.error) {
        setCategoryError(categoryResponse.error);
        toast({ title: 'Error Fetching Category Data', description: categoryResponse.error, variant: 'destructive' });
        setCategorySpendingData([]);
      } else if (categoryResponse.data) {
        setCategorySpendingData(categoryResponse.data);
      }

      if (analyticsResponse.error) {
          setAnalyticsError(analyticsResponse.error);
          toast({ title: 'Error Fetching Spending Analytics', description: analyticsResponse.error, variant: 'destructive' });
          setMonthlyBreakdown([]);
          setOverallMetrics(null);
      } else {
          setMonthlyBreakdown(analyticsResponse.monthlyBreakdown || []);
          setOverallMetrics(analyticsResponse.overallMetrics || null);
      }

    } catch (e: any) {
        console.error("Failed to load all distribution data:", e);
        const errorMessage = e.message || "An unexpected error occurred.";
        setCategoryError(errorMessage);
        setAnalyticsError(errorMessage);
        toast({ title: 'Error Loading Page Data', description: errorMessage, variant: 'destructive' });
    } finally {
        setIsLoadingCategories(false);
        setIsLoadingAnalytics(false);
    }

  }, [user?.id, isAuthenticated, authIsLoading, router, toast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const formatCurrency = (amount?: number) => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  const formatYearMonth = (yearMonthString?: string): string => {
    if (!yearMonthString || !/^\d{4}-\d{2}$/.test(yearMonthString)) return "N/A";
    const [year, month] = yearMonthString.split('-');
    try {
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return format(date, 'MMM yyyy');
    } catch (e) {
        return yearMonthString; // fallback
    }
  };
  
  const categoryChartConfig = {
    totalSpent: { label: "Total Spent by Category", color: "hsl(var(--primary))" },
  } satisfies Record<string, { label: string; color: string }>;

  const monthlyChartConfig: Record<string, { label: string; color: string }> = {
    totalSpent: { label: "Total Spent by Month", color: "hsl(var(--accent))" },
  };


  if (authIsLoading || (isLoadingCategories && isLoadingAnalytics && !categorySpendingData.length && !monthlyBreakdown.length && !categoryError && !analyticsError) ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Loading Spending Insights...</p>
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

      <main className="flex-1 container mx-auto max-w-5xl p-4 md:p-8 space-y-12">
        
        {/* Overall Spending Summary Section */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-3xl mb-1 flex items-center gap-2">
              <Sigma className="h-7 w-7 text-primary" />
              Overall Spending Summary
            </CardTitle>
            <CardDescription>
              A high-level overview of your invoice spending.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAnalytics && !overallMetrics && !analyticsError && (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Calculating overall stats...</p>
              </div>
            )}
            {analyticsError && !isLoadingAnalytics && (
              <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-6 rounded-md">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">Could not load overall stats</p>
                <p className="text-center">{analyticsError}</p>
              </div>
            )}
            {!isLoadingAnalytics && !analyticsError && !overallMetrics && (
                 <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md">
                    <Info className="h-12 w-12 mb-4" />
                    <p className="text-xl font-semibold">No Overall Stats Available</p>
                    <p className="text-center">Process some invoices to see overall spending summary.</p>
                </div>
            )}
            {!isLoadingAnalytics && !analyticsError && overallMetrics && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-muted-foreground">Total Overall Spending</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(overallMetrics.totalOverallSpending)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-muted-foreground">Average Monthly Spending</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(overallMetrics.averageMonthlySpending)}</p>
                    <p className="text-xs text-muted-foreground">Over {overallMetrics.numberOfActiveMonths} month(s)</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-muted-foreground">Active Spending Period</CardTitle>
                  </CardHeader>
                  <CardContent>
                     {overallMetrics.firstMonthActive && overallMetrics.lastMonthActive ? (
                        <p className="text-lg font-semibold">
                            {formatYearMonth(overallMetrics.firstMonthActive)} - {formatYearMonth(overallMetrics.lastMonthActive)}
                        </p>
                     ) : (
                        <p className="text-lg font-semibold">N/A</p>
                     )}
                    <p className="text-xs text-muted-foreground">{overallMetrics.numberOfActiveMonths} month(s) with recorded invoices.</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Monthly Spending Trend Section */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-3xl mb-1 flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-primary" />
              Monthly Spending Trend
            </CardTitle>
            <CardDescription>
              Visualize your total spending for each month.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingAnalytics && monthlyBreakdown.length === 0 && !analyticsError && (
                 <div className="flex flex-col items-center justify-center py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-accent" />
                    <p className="mt-4 text-muted-foreground">Loading monthly trend...</p>
                </div>
            )}
            {analyticsError && !isLoadingAnalytics && (
              <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-6 rounded-md">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">Could not load monthly trend data</p>
                <p className="text-center">{analyticsError}</p>
              </div>
            )}
            {!isLoadingAnalytics && !analyticsError && monthlyBreakdown.length === 0 && (
              <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md">
                <Info className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">No Monthly Spending Data</p>
                <p className="text-center">Upload invoices to see your monthly spending trend.</p>
              </div>
            )}
            {!isLoadingAnalytics && !analyticsError && monthlyBreakdown.length > 0 && (
              <>
                <div className="h-[400px] w-full">
                   <ChartContainer config={monthlyChartConfig} className="h-full w-full">
                    <BarChart accessibilityLayer data={monthlyBreakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        tickFormatter={(value) => formatYearMonth(value)}
                      />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        content={<ChartTooltipContent 
                                    formatter={(value) => formatCurrency(value as number)} 
                                    labelFormatter={(label) => formatYearMonth(label as string)} 
                                />}
                      />
                      <Legend />
                      <Bar dataKey="totalSpent" name="Total Spent" fill="var(--color-totalSpent)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Separator />
        
        {/* Spending by Category Section (Existing) */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="font-headline text-3xl mb-1 flex items-center gap-2">
              <BarChartHorizontalBig className="h-7 w-7 text-primary" />
              Spending by Category
            </CardTitle>
            <CardDescription>
              View a breakdown of your spending across different AI-suggested categories. 
              Note: If an invoice has multiple categories, its total amount contributes to each category listed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoadingCategories && categorySpendingData.length === 0 && !categoryError && (
                 <div className="flex flex-col items-center justify-center py-10">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="mt-4 text-muted-foreground">Calculating category distribution...</p>
                </div>
            )}
            {categoryError && !isLoadingCategories && (
              <div className="flex flex-col items-center justify-center text-destructive bg-destructive/10 p-6 rounded-md">
                <AlertTriangle className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">Could not load category spending data</p>
                <p className="text-center">{categoryError}</p>
              </div>
            )}
            {!isLoadingCategories && !categoryError && categorySpendingData.length === 0 && (
              <div className="flex flex-col items-center justify-center text-muted-foreground bg-muted/50 p-6 rounded-md">
                <Info className="h-12 w-12 mb-4" />
                <p className="text-xl font-semibold">No Category Spending Data Available</p>
                <p className="text-center">Upload and categorize some invoices to see your spending distribution.</p>
              </div>
            )}
            {!isLoadingCategories && !categoryError && categorySpendingData.length > 0 && (
              <>
                <div className="h-[400px] w-full">
                   <ChartContainer config={categoryChartConfig} className="h-full w-full">
                    <BarChart accessibilityLayer data={categorySpendingData} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="category"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                      />
                      <YAxis tickFormatter={(value) => formatCurrency(value)} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))' }}
                        content={<ChartTooltipContent formatter={(value) => `${formatCurrency(value as number)}`} />}
                      />
                      <Legend />
                      <Bar dataKey="totalSpent" name="Total Spent" fill="var(--color-totalSpent)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
                
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">Category Spending Summary Table</h3>
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
                        {categorySpendingData.map((item) => (
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
           {(!isLoadingCategories && categorySpendingData.length > 0) && (
                <CardFooter className="text-xs text-muted-foreground">
                    Data based on AI-suggested categories for processed invoices.
                </CardFooter>
            )}
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


    