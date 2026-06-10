import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import pool from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';

const addStaffSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['owner', 'attendant']),
});

/**
 * Staff Route: Get revenue dashboard stats
 */
export async function getDashboardStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const cyberId = req.user!.cyber_id;

    // 1. Calculate Daily Revenue (paid/completed orders today)
    const dailyRevenueRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM orders 
       WHERE payment_status = 'paid' 
         AND created_at >= CURRENT_DATE`
    );

    // 2. Calculate Weekly Revenue
    const weeklyRevenueRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM orders 
       WHERE payment_status = 'paid' 
         AND created_at >= date_trunc('week', CURRENT_DATE)`
    );

    // 3. Calculate Monthly Revenue
    const monthlyRevenueRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM orders 
       WHERE payment_status = 'paid' 
         AND created_at >= date_trunc('month', CURRENT_DATE)`
    );

    // 4. Best Selling Services
    const bestSellersRes = await pool.query(
      `SELECT s.name as service_name, 
              SUM(oi.quantity)::integer as sales_count, 
              SUM(oi.subtotal) as total_revenue
       FROM order_items oi
       JOIN services s ON oi.service_id = s.id
       JOIN orders o ON oi.order_id = o.id
       WHERE o.payment_status = 'paid'
         AND s.cyber_id = $1
       GROUP BY s.name
       ORDER BY sales_count DESC
       LIMIT 5`,
      [cyberId]
    );

    // 5. Order breakdown statuses
    const ordersBreakdownRes = await pool.query(
      `SELECT order_status, COUNT(*) as count 
       FROM orders 
       GROUP BY order_status`
    );

    // 6. Detailed daily revenue chart (last 7 days)
    const chartRes = await pool.query(
      `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as date, 
              COALESCE(SUM(total_amount), 0) as revenue
       FROM orders
       WHERE payment_status = 'paid'
         AND created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY date
       ORDER BY date ASC`
    );

    res.status(200).json({
      success: true,
      stats: {
        dailyRevenue: parseFloat(dailyRevenueRes.rows[0].total),
        weeklyRevenue: parseFloat(weeklyRevenueRes.rows[0].total),
        monthlyRevenue: parseFloat(monthlyRevenueRes.rows[0].total),
        bestSellingServices: bestSellersRes.rows,
        ordersBreakdown: ordersBreakdownRes.rows.reduce((acc: any, row: any) => {
          acc[row.order_status] = parseInt(row.count, 10);
          return acc;
        }, {}),
        revenueChart: chartRes.rows.map(r => ({ date: r.date, revenue: parseFloat(r.revenue) })),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: List all staff members
 */
export async function getStaffMembers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const cyberId = req.user!.cyber_id;

    const staffRes = await pool.query(
      `SELECT id, name, email, role, created_at 
       FROM users 
       WHERE cyber_id = $1 
       ORDER BY created_at DESC`,
      [cyberId]
    );

    res.status(200).json({
      success: true,
      staff: staffRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: Add a new staff member (Owner only)
 */
export async function addStaffMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const parseRes = addStaffSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { name, email, password, role } = parseRes.data;
    const cyberId = req.user!.cyber_id;

    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Email already registered.' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert staff
    const insertRes = await pool.query(
      `INSERT INTO users (cyber_id, name, email, password_hash, role) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, created_at`,
      [cyberId, name, email, passwordHash, role]
    );

    PrintService.logAction('ADD_STAFF', `Added new staff: ${name} (${role})`, req.user?.id);

    res.status(201).json({
      success: true,
      message: 'Staff member added successfully',
      staff: insertRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: Delete staff member (Owner only)
 */
export async function deleteStaffMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const cyberId = req.user!.cyber_id;

    // Prevent deleting self
    if (id === req.user!.id) {
      return res.status(400).json({ success: false, error: 'You cannot remove yourself.' });
    }

    // Check if user exists and is in the same cyber cafe
    const staffRes = await pool.query('SELECT name FROM users WHERE id = $1 AND cyber_id = $2', [id, cyberId]);
    if (staffRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Staff member not found or unauthorized' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    PrintService.logAction('REMOVE_STAFF', `Removed staff member: ${staffRes.rows[0].name} (ID: ${id})`, req.user?.id);

    res.status(200).json({
      success: true,
      message: 'Staff member removed successfully',
    });
  } catch (error) {
    next(error);
  }
}
