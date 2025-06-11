
"use client";

import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser, registerUser, type AuthUser, type AuthResponse } from '@/app/auth/actions';
import { useToast } from '@/hooks/use-toast';

interface ContextUser extends AuthUser {}

interface AuthContextType {
  user: ContextUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, passwordInput: string) => Promise<void>;
  register: (name: string, email: string, passwordInput: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'authUser_invoice_insights';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ContextUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Error reading user from localStorage", error);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear potentially corrupted data
    }
    setIsLoading(false);
  }, []);

  const handleAuthResponse = useCallback((response: AuthResponse, successRedirect: string = '/dashboard') => {
    if (response.error) {
      toast({ title: 'Authentication Failed', description: response.error, variant: 'destructive' });
      return false;
    }
    if (response.user) {
      setUser(response.user);
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
      } catch (error) {
        console.error("Error writing user to localStorage", error);
      }
      toast({ title: 'Success', description: response.message || 'Action successful!', variant: 'default' });
      router.push(successRedirect);
      return true;
    }
    return false;
  }, [router, toast]);

  const login = useCallback(async (email: string, passwordInput: string) => {
    setIsLoading(true);
    const response = await loginUser(email, passwordInput);
    handleAuthResponse(response);
    setIsLoading(false);
  }, [handleAuthResponse]);

  const register = useCallback(async (name: string, email: string, passwordInput: string) => {
    setIsLoading(true);
    const response = await registerUser(name, email, passwordInput);
    // On successful registration, typically log the user in or redirect to login
    // For this implementation, successful registration will log the user in.
    if (handleAuthResponse(response)) {
        // User is set and redirected by handleAuthResponse
    }
    setIsLoading(false);
  }, [handleAuthResponse]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setUser(null);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch (error) {
      console.error("Error clearing user from localStorage", error);
    }
    // Simulate any server-side logout if necessary (e.g., invalidating a token)
    await new Promise(resolve => setTimeout(resolve, 300)); 
    setIsLoading(false);
    router.push('/login');
    toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
  }, [router, toast]);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
