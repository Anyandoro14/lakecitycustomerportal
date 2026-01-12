import { z } from 'zod';

// Password must be at least 8 characters with uppercase, lowercase, number, and special character
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const emailSchema = z
  .string()
  .trim()
  .email('Please enter a valid email address')
  .max(255, 'Email must be less than 255 characters');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{6,14}$/, 'Please enter a valid phone number (e.g., +1234567890)');

// Stand number validation - alphanumeric, typically like "A123" or "Block-A-12"
export const standNumberSchema = z
  .string()
  .trim()
  .min(1, 'Stand number is required')
  .max(50, 'Stand number must be less than 50 characters');

export const loginSchema = z.object({
  standNumber: standNumberSchema,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema,
});

export const verificationCodeSchema = z
  .string()
  .length(6, 'Verification code must be 6 digits')
  .regex(/^\d+$/, 'Verification code must only contain numbers');

// Helper function to mask phone number for display
export const maskPhoneNumber = (phone: string): string => {
  if (!phone || phone.length < 4) return phone;
  const visibleStart = phone.slice(0, 3);
  const visibleEnd = phone.slice(-2);
  const maskedMiddle = '*'.repeat(Math.max(0, phone.length - 5));
  return `${visibleStart}${maskedMiddle}${visibleEnd}`;
};

// Helper to format currency consistently
export const formatCurrency = (value: string | number, currency = 'USD'): string => {
  const numValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[$,]/g, '')) 
    : value;
  
  if (isNaN(numValue)) return '$0.00';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
};

// Validate that password requirements are met and return errors
export const getPasswordErrors = (password: string): string[] => {
  const errors: string[] = [];
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('One uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('One lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('One number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('One special character');
  return errors;
};
