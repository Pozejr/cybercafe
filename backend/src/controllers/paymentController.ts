import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MpesaService } from '../services/mpesa';
import { PrintService } from '../services/printService';
import pool from '../config/db';

const initiatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  phone: z.string().min(9, 'Phone must be at least 9 characters'),
});

/**
 * Public Route: Initiate Lipa Na M-Pesa STK Push
 */
export async function initiatePayment(req: Request, res: Response, next: NextFunction) {
  try {
    const parseRes = initiatePaymentSchema.safeParse(req.body);
    if (!parseRes.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: parseRes.error.errors.map(e => e.message),
      });
    }

    const { orderId, phone } = parseRes.data;

    // Fetch order details
    const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    const order = orderRes.rows[0];

    // Trigger STK Push (Or fallback simulated checkout)
    const result = await MpesaService.initiateStkPush({
      orderId: order.id,
      orderNumber: order.order_number,
      phone: phone,
      amount: parseFloat(order.total_amount),
    });

    if (result.success) {
      PrintService.logAction(
        'MPESA_INITIATE',
        `M-Pesa STK push initiated for Order ${order.order_number} (${order.total_amount} KES) to phone: ${phone}. CheckoutID: ${result.checkoutRequestId}`
      );

      res.status(200).json({
        success: true,
        message: result.message,
        checkoutRequestId: result.checkoutRequestId,
        isSimulated: result.isSimulated,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Public Route: M-Pesa Callback Webhook (Called by Daraja API)
 */
export async function paymentCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const isProcessed = await MpesaService.processCallback(req.body);
    
    // Safaricom expects a standard JSON acknowledgement response
    res.status(200).json({
      ResultCode: isProcessed ? 0 : 1,
      ResultDesc: isProcessed ? 'Callback accepted and processed successfully' : 'Callback processing rejected',
    });
  } catch (error) {
    console.error('Callback handler exception:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Internal server error in callback' });
  }
}

/**
 * Public Route: Simulate successful payment (Developer Sandbox simulation)
 */
export async function simulatePaymentSuccess(req: Request, res: Response, next: NextFunction) {
  try {
    const { checkoutRequestId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ success: false, error: 'checkoutRequestId is required.' });
    }

    // Process simulation
    const success = await MpesaService.simulateSuccessfulPayment(checkoutRequestId);

    if (success) {
      // Auto queue print jobs since order is paid
      const payRes = await pool.query('SELECT order_id FROM payments WHERE mpesa_receipt = $1 OR mpesa_receipt LIKE $2', [checkoutRequestId, `%${checkoutRequestId}%`]);
      if (payRes.rows.length > 0) {
        const orderId = payRes.rows[0].order_id;
        const ordRes = await pool.query('SELECT order_number FROM orders WHERE id = $1', [orderId]);
        if (ordRes.rows.length > 0) {
          await PrintService.queuePaidOrder(orderId, ordRes.rows[0].order_number);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Simulation callback processed successfully. Order updated to PAID.',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Simulation callback processing failed or payment record not found.',
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Public Route: Simulate failed payment
 */
export async function simulatePaymentFailure(req: Request, res: Response, next: NextFunction) {
  try {
    const { checkoutRequestId, reason } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ success: false, error: 'checkoutRequestId is required.' });
    }

    const success = await MpesaService.simulateFailedPayment(checkoutRequestId, reason || 'User cancelled');

    if (success) {
      res.status(200).json({
        success: true,
        message: 'Simulation callback processed successfully. Order updated to FAILED.',
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Simulation callback processing failed.',
      });
    }
  } catch (error) {
    next(error);
  }
}
