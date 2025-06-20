
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { AppLogo } from '@/components/app-logo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from '@/hooks/use-toast';
import { useRouter, useSearchParams } from 'next/navigation';

// This new component will handle the forms and tab logic, using useSearchParams
function LoginFormComponent() {
  const { login, register, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter(); 

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Initialize activeTab directly from searchParams
  const initialTabFromUrl = searchParams.get('tab') === 'register' ? 'register' : 'login';
  const [activeTab, setActiveTab] = useState(initialTabFromUrl);

  // useEffect to handle external URL changes (e.g., browser back/forward buttons, or direct link)
  useEffect(() => {
    const currentUrlTabValue = searchParams.get('tab');
    const targetTab = currentUrlTabValue === 'register' ? 'register' : 'login';
    if (targetTab !== activeTab) {
      setActiveTab(targetTab);
    }
  }, [searchParams, activeTab]); // Re-check activeTab in case it was out of sync

  const handleTabChange = (newTabValue: string) => {
    setActiveTab(newTabValue); // Update React state
    // Update URL, using replace to avoid too many history entries for simple tab clicks
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
    currentParams.set('tab', newTabValue);
    router.replace(`/login?${currentParams.toString()}`, { scroll: false });
  };


  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await login(loginEmail, loginPassword); // Auth context handles redirect on success
    setIsSubmitting(false); 
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerPassword !== confirmPassword) {
      toast({ title: 'Registration Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    await register(registerName, registerEmail, registerPassword); // Auth context handles redirect on success
    setIsSubmitting(false); 
  };

  const isLoading = authLoading || isSubmitting;

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="login">Sign In</TabsTrigger>
        <TabsTrigger value="register">Create Account</TabsTrigger>
      </TabsList>
      <TabsContent value="login">
        <CardHeader className="items-center text-center pt-0">
          <CardTitle>Welcome Back!</CardTitle>
          <CardDescription>
            Sign in to access your invoice dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="user@example.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-4 w-4" />
              )}
              Sign In
            </Button>
          </form>
        </CardContent>
      </TabsContent>
      <TabsContent value="register">
        <CardHeader className="items-center text-center pt-0">
          <CardTitle>Create an Account</CardTitle>
          <CardDescription>
            Join Invoice Insights today.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegisterSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="register-name">Full Name</Label>
              <Input
                id="register-name"
                type="text"
                placeholder="Your Name"
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">Email</Label>
              <Input
                id="register-email"
                type="email"
                placeholder="user@example.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Password</Label>
              <Input
                id="register-password"
                type="password"
                placeholder="••••••••"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              Create Account
            </Button>
          </form>
        </CardContent>
      </TabsContent>
    </Tabs>
  );
}


export default function LoginPage() {
  const { isLoading: authIsLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && !authIsLoading) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, authIsLoading, router]);
  
  if (isAuthenticated && !authIsLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">Redirecting to dashboard...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="items-center text-center">
          <AppLogo iconSizeClass="h-10 w-10" textSizeClass="text-4xl" />
        </CardHeader>
        <Suspense fallback={<div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
          <LoginFormComponent />
        </Suspense>
        <CardFooter className="flex-col text-center text-sm mt-4">
          <p className="text-muted-foreground">
            Invoice management made easy. Get started in minutes.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

