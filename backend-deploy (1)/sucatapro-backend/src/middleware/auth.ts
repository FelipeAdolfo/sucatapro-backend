import { Request, Response, NextFunction } from 'express';
import { verifyToken, hasPermission } from '../utils/auth';
import { prisma } from '../server';
import { AuthPayload, UserRole } from '../types';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Authentication middleware
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }
    
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    
    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, active: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }
    
    if (!user.active) {
      return res.status(401).json({ error: 'Usuário desativado' });
    }
    
    req.user = payload;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Erro na autenticação' });
  }
};

// Authorization middleware
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    
    const userRole = req.user.role;
    
    // Check if user has any of the required roles
    const hasRequiredRole = roles.some(role => {
      if (role === userRole) return true;
      return hasPermission(userRole, role);
    });
    
    if (!hasRequiredRole) {
      return res.status(403).json({ error: 'Acesso negado. Permissão insuficiente.' });
    }
    
    next();
  };
};

// Optional authentication (for public routes that need user info if available)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      
      if (payload) {
        req.user = payload;
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};
