"use client";

import type { User as FirebaseUser } from 'firebase/auth'; // Using FirebaseUser for type consistency if real Firebase is added later
import React, { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface MockUser extends Pick<FirebaseUser, 'uid' | 'email' | 'displayName'> {}

interface AuthContextType {
  user: MockUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start true to check initial auth state
  const router = useRouter();

  useEffect(() => {
    // Simulate checking auth state from localStorage
    try {
      const storedAuth = localStorage.getItem('isAuthenticated_invoice_insights');
      const storedUser = localStorage.getItem('user_invoice_insights');
      if (storedAuth === 'true' && storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Error reading from localStorage", error);
      // Handle potential errors, e.g. if localStorage is disabled or data is corrupted
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email?: string, password?: string) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
    const mockUserData: MockUser = { 
      uid: 'mock-user-id-' + Date.now(), 
      email: email || 'user@example.com', 
      displayName: 'Mock User' 
    };
    setUser(mockUserData);
    try {
      localStorage.setItem('isAuthenticated_invoice_insights', 'true');
      localStorage.setItem('user_invoice_insights', JSON.stringify(mockUserData));
    } catch (error) {
      console.error("Error writing to localStorage", error);
    }
    setIsLoading(false);
    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    setUser(null);
    try {
      localStorage.setItem('isAuthenticated_invoice_insights', 'false');
      localStorage.removeItem('user_invoice_insights');
    } catch (error) {
      console.error("Error clearing localStorage", error);
    }
    setIsLoading(false);
    router.push('/login');
  }, [router]);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
