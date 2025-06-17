
"use client";

import Link from 'next/link';
import { AppLogo } from '@/components/app-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, BarChart2, Zap, Lock } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Automated Data Extraction',
    description: 'Effortlessly upload PDFs or images. Our AI extracts vendor, date, total, and line items in seconds.',
    dataAiHint: "automation efficiency"
  },
  {
    icon: CheckCircle,
    title: 'Intelligent Summarization & Categorization',
    description: 'Get plain-English summaries and smart expense category suggestions for every invoice.',
    dataAiHint: "organization clarity"
  },
  {
    icon: BarChart2,
    title: 'Powerful Spending Analysis',
    description: 'Visualize spending by category and month. Discover trends and similar invoices with semantic search.',
    dataAiHint: "financial analytics"
  },
  {
    icon: Lock,
    title: 'Secure and Centralized',
    description: 'All your invoice data, securely stored and accessible from one central dashboard.',
    dataAiHint: "data security"
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <AppLogo iconSizeClass="h-7 w-7" textSizeClass="text-2xl" />
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="py-16 md:py-24 lg:py-32 bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center gap-12">
              <div className="text-center">
                <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl md:text-6xl">
                  Transform Your Invoices into Insights
                </h1>
                <p className="mt-6 text-lg leading-8 text-muted-foreground sm:max-w-xl mx-auto">
                  Stop wrestling with manual data entry. Invoice Insights uses AI to automate invoice processing, categorize expenses, and unlock valuable financial clarity for your business.
                </p>
                <div className="mt-10 flex items-center justify-center gap-x-6">
                  <Button asChild size="lg" className="shadow-lg">
                    <Link href="/login?tab=register">Get Started Free</Link>
                  </Button>
                  <Button asChild variant="ghost" size="lg">
                    <Link href="#features">Learn More &rarr;</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 md:py-24 lg:py-32 bg-background">
          <div className="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                Everything You Need to Manage Invoices Smarter
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                From automated data capture to insightful analytics, Invoice Insights streamlines your entire workflow.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-none grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title} className="flex flex-col shadow-lg hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground mb-4">
                      <feature.icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <CardTitle className="text-xl font-semibold text-primary">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-base text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
         {/* Call to Action Section */}
        <section className="py-16 md:py-24 bg-muted/50">
          <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
              Ready to Simplify Your Invoice Management?
            </h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              Sign up today and experience the power of AI-driven invoice processing.
              No credit card required to get started.
            </p>
            <div className="mt-10">
              <Button asChild size="lg" className="shadow-lg">
                <Link href="/login?tab=register">Sign Up Free Now</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border/40 bg-background">
        <div className="container mx-auto max-w-screen-xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Invoice Insights. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
