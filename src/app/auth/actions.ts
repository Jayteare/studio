'use server';

import { connectToDatabase } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';
import type { User as DbUserDocument } from '@/types/user'; // We'll define this type

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  user?: AuthUser;
  error?: string;
  message?: string;
}

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

export async function registerUser(
  name: string,
  email: string,
  passwordInput: string
): Promise<AuthResponse> {
  try {
    const { db } = await connectToDatabase();
    const existingUser = await db.collection<DbUserDocument>('users').findOne({ email });

    if (existingUser) {
      return { error: 'User with this email already exists.' };
    }

    const passwordHash = await bcrypt.hash(passwordInput, SALT_ROUNDS);

    const newUser: Omit<DbUserDocument, '_id'> = {
      name,
      email,
      passwordHash,
      createdAt: new Date(),
    };

    const result = await db.collection<DbUserDocument>('users').insertOne(newUser as DbUserDocument);
    
    if (!result.insertedId) {
        return { error: 'Failed to create user account.' };
    }

    return {
      user: {
        id: result.insertedId.toHexString(),
        name: newUser.name,
        email: newUser.email,
      },
      message: 'Registration successful!',
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'An unexpected error occurred during registration.' };
  }
}

export async function loginUser(
  email: string,
  passwordInput: string
): Promise<AuthResponse> {
  try {
    const { db } = await connectToDatabase();
    const user = await db.collection<DbUserDocument>('users').findOne({ email });

    if (!user) {
      return { error: 'Invalid email or password.' };
    }

    const isPasswordValid = await bcrypt.compare(passwordInput, user.passwordHash);

    if (!isPasswordValid) {
      return { error: 'Invalid email or password.' };
    }

    return {
      user: {
        id: user._id.toHexString(),
        name: user.name,
        email: user.email,
      },
      message: 'Login successful!',
    };
  } catch (error) {
    console.error('Login error:', error);
    return { error: 'An unexpected error occurred during login.' };
  }
}
