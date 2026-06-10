import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_jwt_secret_2026_kenya_cyber_cafe';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function loginStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const parseRes = loginSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { email, password } = parseRes.data;

    // Fetch user from DB
    const userRes = await pool.query(
      `SELECT u.*, c.name as cyber_name 
       FROM users u
       JOIN cybers c ON u.cyber_id = c.id
       WHERE u.email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];

    // Verify password
    const isPasswordMatch = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user.id,
        cyber_id: user.cyber_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        cyberId: user.cyber_id,
        cyberName: user.cyber_name,
      },
    });
  } catch (error) {
    next(error);
  }
}
