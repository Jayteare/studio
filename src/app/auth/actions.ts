
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
  console.log(`[AuthAction/registerUser] Received registration request for email: ${email}`);
  try {
    const { db } = await connectToDatabase();
    const existingUser = await db.collection<DbUserDocument>('users').findOne({ email });

    if (existingUser) {
      console.warn(`[AuthAction/registerUser] User already exists for email: ${email}`);
      return { error: 'User with this email already exists.' };
    }

    console.log(`[AuthAction/registerUser] Hashing password for email: ${email}`);
    const passwordHash = await bcrypt.hash(passwordInput, SALT_ROUNDS);
    console.log(`[AuthAction/registerUser] Password hashed for email: ${email}`);

    const newUser: Omit<DbUserDocument, '_id'> = {
      name,
      email,
      passwordHash,
      createdAt: new Date(),
    };

    console.log(`[AuthAction/registerUser] Attempting to insert new user into DB:`, { name: newUser.name, email: newUser.email });
    const result = await db.collection<DbUserDocument>('users').insertOne(newUser as DbUserDocument);
    
    console.log('[AuthAction/registerUser] MongoDB insertOne result:', JSON.stringify(result, null, 2));

    if (!result.insertedId) {
      console.error('[AuthAction/registerUser] Failed to create user account: MongoDB insertOne did not return an insertedId.');
      return { error: 'Failed to create user account. Database insertion issue. Please check server logs.' };
    }

    console.log(`[AuthAction/registerUser] User created successfully for email: ${email}, DB ID: ${result.insertedId.toHexString()}`);
    return {
      user: {
        id: result.insertedId.toHexString(),
        name: newUser.name,
        email: newUser.email,
      },
      message: 'Registration successful!',
    };
  } catch (error: any) {
    console.error('[AuthAction/registerUser] Registration error:', error);
    if (error.name === 'MongoNetworkError' || error.message?.includes('connect ECONNREFUSED')) {
        return { error: 'Failed to connect to the database. Please check the connection and try again.' };
    }
    return { error: `An unexpected error occurred during registration: ${error.message || 'Unknown error'}` };
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
  } catch (error: any) {
    console.error('Login error:', error);
    if (error.name === 'MongoNetworkError' || error.message?.includes('connect ECONNREFUSED')) {
        return { error: 'Failed to connect to the database during login. Please check the connection.' };
    }
    return { error: `An unexpected error occurred during login: ${error.message || 'Unknown error'}` };
  }
}
