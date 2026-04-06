import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-padrao';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
export const generateToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token
export const verifyToken = (token: string): AuthPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch (error) {
    return null;
  }
};

// Hash password
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

// Compare password
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Generate random code
export const generateCode = (length: number = 6): string => {
  return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
};

// Generate secure token
export const generateSecureToken = (): string => {
  return require('crypto').randomBytes(32).toString('hex');
};

// Role hierarchy for permissions
export const roleHierarchy: Record<string, number> = {
  'COMPRADOR': 1,
  'COORDENADOR': 2,
  'GERENTE': 3,
  'DIRETOR': 4,
};

// Check if role has permission
export const hasPermission = (userRole: string, requiredRole: string): boolean => {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
};
