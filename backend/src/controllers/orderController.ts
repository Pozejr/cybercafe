import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const documentSchema = z.object({
  filePath: z.string(),
  pages: z.number().int().nonnegative(),
  colorPages: z.number().int().nonnegative(),
  bwPages: z.number().int().nonnegative(),
});

const createOrderSchema = z.object({
  phone: z.string().min(9, 'Phone number must be at least 9 characters'),
  items: z.array(itemSchema).nonempty('At least one service item is required'),
  document: documentSchema.optional(),
});

/**
 * Helper to generate order numbers (e.g., CC-23485)
 */
function generateOrderNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
  return `CC-${digits}`;
}

/**
 * Public Route: Create a new order (No auth required)
 */
export async function createOrder(req: Request, res: Response, next: NextFunction) {
  const client = await pool.connect();
  try {
    const parseRes = createOrderSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { phone, items, document } = parseRes.data;

    await client.query('BEGIN');

    // 1. Calculate and verify total amount from database to prevent price spoofing
    let calculatedTotal = 0;
    const validatedItems: Array<{ serviceId: string; quantity: number; unitPrice: number; subtotal: number }> = [];

    for (const item of items) {
      const serviceRes = await client.query('SELECT price, name FROM services WHERE id = $1', [item.serviceId]);
      if (serviceRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: `Service ID ${item.serviceId} not found` });
      }

      const unitPrice = parseFloat(serviceRes.rows[0].price);
      const subtotal = unitPrice * item.quantity;
      calculatedTotal += subtotal;

      validatedItems.push({
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });
    }

    // 2. Generate a unique order number
    let orderNumber = generateOrderNumber();
    let isUnique = false;
    while (!isUnique) {
      const checkRes = await client.query('SELECT id FROM orders WHERE order_number = $1', [orderNumber]);
      if (checkRes.rows.length === 0) {
        isUnique = true;
      } else {
        orderNumber = generateOrderNumber();
      }
    }

    // 3. Create Order
    const orderRes = await client.query(
      `INSERT INTO orders (order_number, phone, total_amount, payment_status, order_status) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderNumber, phone, calculatedTotal, 'pending', 'pending']
    );

    const order = orderRes.rows[0];

    // 4. Create Order Items
    for (const vItem of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, service_id, quantity, subtotal) 
         VALUES ($1, $2, $3, $4)`,
        [order.id, vItem.serviceId, vItem.quantity, vItem.subtotal]
      );
    }

    // 5. Create Document if uploaded
    if (document) {
      await client.query(
        `INSERT INTO documents (order_id, file_path, pages, color_pages, bw_pages) 
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, document.filePath, document.pages, document.colorPages, document.bwPages]
      );
    }

    await client.query('COMMIT');

    PrintService.logAction('CREATE_ORDER', `Created order ${orderNumber} for phone ${phone}. Total: ${calculatedTotal} KES`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: order.id,
        orderNumber: order.order_number,
        phone: order.phone,
        totalAmount: order.total_amount,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        createdAt: order.created_at,
      },
      items: validatedItems,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Public Route: Track order status (No auth required)
 */
export async function getOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, orderNumber } = req.query;

    if (!phone || !orderNumber) {
      return res.status(400).json({ success: false, error: 'Phone number and Order number are required.' });
    }

    // Query order
    const orderRes = await pool.query(
      `SELECT o.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', oi.id,
                    'service_name', s.name,
                    'quantity', oi.quantity,
                    'subtotal', oi.subtotal
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items,
              d.pages, d.color_pages, d.bw_pages, d.file_path,
              p.mpesa_receipt, p.status as payment_record_status
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN services s ON oi.service_id = s.id
       LEFT JOIN documents d ON o.id = d.order_id
       LEFT JOIN payments p ON o.id = p.order_id
       WHERE o.order_number = $1 AND o.phone = $2
       GROUP BY o.id, d.id, p.id`,
      [String(orderNumber).trim(), String(phone).trim()]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found. Please verify the details.' });
    }

    const order = orderRes.rows[0];

    res.status(200).json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        phone: order.phone,
        totalAmount: order.total_amount,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        createdAt: order.created_at,
        items: order.items,
        document: order.file_path ? {
          pages: order.pages,
          colorPages: order.color_pages,
          bwPages: order.bw_pages,
        } : null,
        mpesaReceipt: order.mpesa_receipt,
        paymentRecordStatus: order.payment_record_status,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: List all orders for the cyber cafe (Auth required)
 */
export async function listOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { status, paymentStatus } = req.query;

    let query = `
      SELECT o.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'name', s.name,
                   'quantity', oi.quantity,
                   'subtotal', oi.subtotal
                 )
               ) FILTER (WHERE oi.id IS NOT NULL), '[]'
             ) as items,
             d.file_path, d.pages, d.color_pages, d.bw_pages
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN services s ON oi.service_id = s.id
      LEFT JOIN documents d ON o.id = d.order_id
    `;

    const queryParams: any[] = [];
    const clauses: string[] = [];

    if (status) {
      queryParams.push(status);
      clauses.push(`o.order_status = $${queryParams.length}`);
    }

    if (paymentStatus) {
      queryParams.push(paymentStatus);
      clauses.push(`o.payment_status = $${queryParams.length}`);
    }

    if (clauses.length > 0) {
      query += ` WHERE ` + clauses.join(' AND ');
    }

    query += ` GROUP BY o.id, d.id ORDER BY o.created_at DESC`;

    const ordersRes = await pool.query(query, queryParams);

    res.status(200).json({
      success: true,
      orders: ordersRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: View individual order details (Auth required)
 */
export async function getOrderDetails(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const orderRes = await pool.query(
      `SELECT o.*, 
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', oi.id,
                    'service_id', s.id,
                    'name', s.name,
                    'price', s.price,
                    'quantity', oi.quantity,
                    'subtotal', oi.subtotal
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items,
              d.id as doc_id, d.file_path, d.pages, d.color_pages, d.bw_pages,
              p.id as payment_id, p.mpesa_receipt, p.amount as payment_amount, p.status as payment_record_status, p.created_at as paid_at
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN services s ON oi.service_id = s.id
       LEFT JOIN documents d ON o.id = d.order_id
       LEFT JOIN payments p ON o.id = p.order_id
       WHERE o.id = $1
       GROUP BY o.id, d.id, p.id`,
      [id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    res.status(200).json({
      success: true,
      order: orderRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff Route: Update order status (Auth required)
 */
export async function updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    const validatedStatus = ['pending', 'paid', 'processing', 'ready', 'completed'];
    const validatedPayment = ['pending', 'paid', 'failed'];

    if (orderStatus && !validatedStatus.includes(orderStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid order status' });
    }

    if (paymentStatus && !validatedPayment.includes(paymentStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid payment status' });
    }

    // Fetch original order
    const orderCheck = await pool.query('SELECT order_number, order_status, payment_status FROM orders WHERE id = $1', [id]);
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const originalOrder = orderCheck.rows[0];

    // Build update parameters dynamically
    const fields: string[] = [];
    const values: any[] = [];

    if (orderStatus) {
      values.push(orderStatus);
      fields.push(`order_status = $${values.length}`);
    }

    if (paymentStatus) {
      values.push(paymentStatus);
      fields.push(`payment_status = $${values.length}`);
    }

    values.push(id);
    const updateQuery = `UPDATE orders SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;

    const updateRes = await pool.query(updateQuery, values);
    const updatedOrder = updateRes.rows[0];

    // Audit logs
    PrintService.logAction(
      'UPDATE_ORDER_STATUS',
      `Order ${updatedOrder.order_number} status changed. [Order: ${originalOrder.order_status} -> ${updatedOrder.order_status}] [Payment: ${originalOrder.payment_status} -> ${updatedOrder.payment_status}]`,
      req.user?.id
    );

    // Business Rule: If changed to 'paid', auto queue for printing
    if (paymentStatus === 'paid' && originalOrder.payment_status !== 'paid') {
      await PrintService.queuePaidOrder(id, updatedOrder.order_number);
    }

    res.status(200).json({
      success: true,
      message: 'Order updated successfully',
      order: updatedOrder,
    });
  } catch (error) {
    next(error);
  }
}
