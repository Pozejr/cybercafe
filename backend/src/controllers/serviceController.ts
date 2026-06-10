import { Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';

const serviceSchema = z.object({
  name: z.string().min(3, 'Service name must be at least 3 characters'),
  price: z.number().positive('Price must be greater than zero'),
});

/**
 * List all services (Public or Staff)
 */
export async function getServices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // If authenticated, we use user's cyber_id. Otherwise, we fetch from the first cyber in the DB for the customer.
    let cyberId = req.user?.cyber_id;

    if (!cyberId) {
      const cyberRes = await pool.query('SELECT id FROM cybers LIMIT 1');
      if (cyberRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'No cyber cafes found in database.' });
      }
      cyberId = cyberRes.rows[0].id;
    }

    const servicesRes = await pool.query(
      `SELECT * FROM services WHERE cyber_id = $1 ORDER BY name ASC`,
      [cyberId]
    );

    res.status(200).json({
      success: true,
      services: servicesRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new service (Staff only)
 */
export async function createService(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const parseRes = serviceSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { name, price } = parseRes.data;
    const cyberId = req.user!.cyber_id;

    const insertRes = await pool.query(
      `INSERT INTO services (cyber_id, name, price) VALUES ($1, $2, $3) RETURNING *`,
      [cyberId, name, price]
    );

    PrintService.logAction('CREATE_SERVICE', `Created service: ${name} (${price} KES)`, req.user?.id);

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service: insertRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a service (Staff only)
 */
export async function updateService(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const parseRes = serviceSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { name, price } = parseRes.data;
    const cyberId = req.user!.cyber_id;

    // Check ownership
    const checkRes = await pool.query('SELECT * FROM services WHERE id = $1 AND cyber_id = $2', [id, cyberId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service not found or unauthorized' });
    }

    const updateRes = await pool.query(
      `UPDATE services SET name = $1, price = $2 WHERE id = $3 RETURNING *`,
      [name, price, id]
    );

    PrintService.logAction('UPDATE_SERVICE', `Updated service ID ${id} to: ${name} (${price} KES)`, req.user?.id);

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      service: updateRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a service (Staff only)
 */
export async function deleteService(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const cyberId = req.user!.cyber_id;

    // Check ownership
    const checkRes = await pool.query('SELECT * FROM services WHERE id = $1 AND cyber_id = $2', [id, cyberId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Service not found or unauthorized' });
    }

    await pool.query('DELETE FROM services WHERE id = $1', [id]);

    PrintService.logAction('DELETE_SERVICE', `Deleted service: ${checkRes.rows[0].name} (ID: ${id})`, req.user?.id);

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}
