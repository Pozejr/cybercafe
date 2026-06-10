import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_jwt_secret_2026_kenya_cyber_cafe';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    cyber_id: string;
    name: string;
    email: string;
    role: 'owner' | 'attendant';
  };
}

/**
 * JWT Authentication Middleware for Staff Only
 */
export function authenticateStaff(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedRequest['user'];
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
}

/**
 * RBAC: Only Owners Allowed
 */
export function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'owner') {
    return res.status(403).json({ success: false, error: 'Access denied. Owner permissions required.' });
  }
  next();
}
