import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pool from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';
import { ServiceFlowEngine } from '../services/serviceFlowEngine';

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().positive(),
  pages: z.number().int().nonnegative().optional(),
});

const documentSchema = z.object({
  filePath: z.string(),
  pages: z.number().int().nonnegative(),
  colorPages: z.number().int().nonnegative(),
  bwPages: z.number().int().nonnegative(),
  fileType: z.string().optional(),
  pageSize: z.string().optional(),
});

// Upgraded Phase 2 order creation schema
const createOrderSchema = z.object({
  phone: z.string().min(9, 'Phone number must be at least 9 characters'),
  items: z.array(itemSchema).nonempty('At least one service item is required'),
  documents: z.array(documentSchema).optional(), // upgraded from single 'document' to multi-file array
  document: documentSchema.optional(), // backward compatibility support
  specialInstructions: z.string().optional(), // Phase 2 custom notes
});

function generateOrderNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `CC-${digits}`;
}

/**
 * Public Route: Upgraded Intelligent Order Creation (Phase 2)
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

    const { phone, items, documents, document, specialInstructions } = parseRes.data;

    await client.query('BEGIN');

    // 1. Calculate prices securely on the backend using ServiceFlowEngine rules
    let calculatedTotal = 0;
    const validatedItems: Array<{ 
      serviceId: string; 
      quantity: number; 
      unitPrice: number; 
      subtotal: number;
      pricingType: 'per_page' | 'fixed' | 'per_item';
      pages: number;
    }> = [];

    for (const item of items) {
      const serviceRes = await client.query('SELECT price, name, pricing_type FROM services WHERE id = $1', [item.serviceId]);
      if (serviceRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: `Service ID ${item.serviceId} not found` });
      }

      const service = serviceRes.rows[0];
      const unitPrice = parseFloat(service.price);
      const pricingType = (service.pricing_type || 'fixed') as 'per_page' | 'fixed' | 'per_item';
      
      // Determine pages to use for calculation
      const itemPages = item.pages || 1;

      // Invoke ServiceFlowEngine to calculate line pricing
      const priceResult = ServiceFlowEngine.calculatePrice({
        serviceName: service.name,
        unitPrice,
        pricingType,
        pages: itemPages,
        quantity: item.quantity,
      });

      calculatedTotal += priceResult.totalAmount;

      validatedItems.push({
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice,
        subtotal: priceResult.totalAmount,
        pricingType,
        pages: itemPages,
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

    // 3. Insert Order with Special Instructions
    const orderRes = await client.query(
      `INSERT INTO orders (order_number, phone, total_amount, payment_status, order_status, special_instructions) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [orderNumber, phone, calculatedTotal, 'pending', 'pending', specialInstructions || null]
    );

    const order = orderRes.rows[0];

    // 4. Insert Order Items
    for (const vItem of validatedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, service_id, quantity, subtotal) 
         VALUES ($1, $2, $3, $4)`,
        [order.id, vItem.serviceId, vItem.quantity, vItem.subtotal]
      );
    }

    // 5. Handle Document Insertion & Upgraded Analysis mapping
    const finalDocs = [];
    if (documents && documents.length > 0) {
      finalDocs.push(...documents);
    } else if (document) {
      finalDocs.push(document);
    }

    if (finalDocs.length > 0) {
      let aggregatePages = 0;
      let aggregateColor = 0;
      let aggregateBw = 0;

      for (const doc of finalDocs) {
        // Insert legacy row for backward compatibility file retrieval
        await client.query(
          `INSERT INTO documents (order_id, file_path, pages, color_pages, bw_pages) 
           VALUES ($1, $2, $3, $4, $5)`,
          [order.id, doc.filePath, doc.pages, doc.colorPages, doc.bwPages]
        );

        aggregatePages += doc.pages;
        aggregateColor += doc.colorPages;
        aggregateBw += doc.bwPages;
      }

      // Populate upgraded document_analysis table
      await client.query(
        `INSERT INTO document_analysis (order_id, total_pages, color_pages, bw_pages, file_type, analysis_json) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          order.id, 
          aggregatePages, 
          aggregateColor, 
          aggregateBw, 
          finalDocs[0].fileType || 'application/octet-stream', 
          JSON.stringify({ files: finalDocs })
        ]
      );
    }

    await client.query('COMMIT');

    PrintService.logAction('CREATE_ORDER', `Created upgraded order ${orderNumber}. Flow total: ${calculatedTotal} KES`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully under Phase 2 workflow.',
      order: {
        id: order.id,
        orderNumber: order.order_number,
        phone: order.phone,
        totalAmount: order.total_amount,
        paymentStatus: order.payment_status,
        orderStatus: order.order_status,
        specialInstructions: order.special_instructions,
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
 * Public Route: Track order status
 */
export async function getOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, orderNumber } = req.query;

    if (!phone || !orderNumber) {
      return res.status(400).json({ success: false, error: 'Phone number and Order number are required.' });
    }

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
              da.total_pages, da.color_pages, da.bw_pages, da.file_type, da.analysis_json,
              p.mpesa_receipt, p.status as payment_record_status
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN services s ON oi.service_id = s.id
       LEFT JOIN document_analysis da ON o.id = da.order_id
       LEFT JOIN payments p ON o.id = p.order_id
       WHERE o.order_number = $1 AND o.phone = $2
       GROUP BY o.id, da.id, p.id`,
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
        specialInstructions: order.special_instructions,
        createdAt: order.created_at,
        items: order.items,
        documentAnalysis: order.total_pages ? {
          totalPages: order.total_pages,
          colorPages: order.color_pages,
          bwPages: order.bw_pages,
          fileType: order.file_type,
          details: order.analysis_json,
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
 * Staff Route: List all orders
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
             da.total_pages as pages, da.color_pages, da.bw_pages,
             (SELECT file_path FROM documents WHERE order_id = o.id LIMIT 1) as file_path
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN services s ON oi.service_id = s.id
      LEFT JOIN document_analysis da ON o.id = da.order_id
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

    query += ` GROUP BY o.id, da.id ORDER BY o.created_at DESC`;

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
 * Staff Route: View individual order details
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
              da.total_pages as pages, da.color_pages, da.bw_pages, da.file_type, da.analysis_json,
              (SELECT file_path FROM documents WHERE order_id = o.id LIMIT 1) as file_path,
              p.mpesa_receipt, p.status as payment_record_status
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN services s ON oi.service_id = s.id
       LEFT JOIN document_analysis da ON o.id = da.order_id
       LEFT JOIN payments p ON o.id = p.order_id
       WHERE o.id = $1
       GROUP BY o.id, da.id, p.id`,
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
 * Staff Route: Update order status
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

    const orderCheck = await pool.query('SELECT order_number, order_status, payment_status FROM orders WHERE id = $1', [id]);
    if (orderCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const originalOrder = orderCheck.rows[0];

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

    PrintService.logAction(
      'UPDATE_ORDER_STATUS',
      `Order ${updatedOrder.order_number} status changed. [Order: ${originalOrder.order_status} -> ${updatedOrder.order_status}] [Payment: ${originalOrder.payment_status} -> ${updatedOrder.payment_status}]`,
      req.user?.id
    );

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
