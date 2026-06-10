import pool from '../config/db';
import { Server as SocketServer } from 'socket.io';

interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export class MpesaService {
  private static io: SocketServer | null = null;

  public static setSocketServer(io: SocketServer) {
    this.io = io;
  }

  /**
   * Generates Daraja OAuth Access Token
   */
  private static async getAccessToken(): Promise<string> {
    const consumerKey = process.env.MPESA_CONSUMER_KEY || '';
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET || '';

    if (consumerKey.startsWith('your_') || !consumerKey || !consumerSecret) {
      throw new Error('SimulationMode');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Daraja Auth failed with status ${response.status}`);
      }

      const data = await response.json() as { access_token: string };
      return data.access_token;
    } catch (error) {
      console.error('Error generating Daraja Access Token:', error);
      throw error;
    }
  }

  /**
   * Triggers Safaricom M-Pesa STK Push (Lipa Na M-Pesa Online)
   */
  public static async initiateStkPush(params: {
    orderId: string;
    orderNumber: string;
    phone: string;
    amount: number;
  }): Promise<{ success: boolean; message: string; checkoutRequestId?: string; isSimulated: boolean }> {
    const { orderId, orderNumber, phone, amount } = params;

    // Standardize phone number to Safaricom format: 2547XXXXXXXX or 2541XXXXXXXX
    let formattedPhone = phone.trim().replace(/^\+/, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
      formattedPhone = '254' + formattedPhone;
    }

    const shortcode = process.env.MPESA_SHORTCODE || '174379';
    const passkey = process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    const timestamp = new Date().toISOString().replace(/[-T:Z.]/g, '').substring(0, 14); // YYYYMMDDHHMMSS
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://yourdomain.com/api/payment/callback';

    try {
      let accessToken: string;
      try {
        accessToken = await this.getAccessToken();
      } catch (authError) {
        if ((authError as Error).message === 'SimulationMode' || (authError as Error).message.includes('failed')) {
          console.log(`[M-PESA SIMULATOR] Running in Simulation Mode for order ${orderNumber} (${amount} KES)`);
          
          // Generate simulated checkout ID
          const mockCheckoutId = `ws_CO_Simulated_${Math.floor(Math.random() * 1000000)}`;
          
          // Store simulated payment tracking
          await pool.query(
            `INSERT INTO payments (order_id, mpesa_receipt, amount, status) 
             VALUES ($1, $2, $3, $4)`,
            [orderId, mockCheckoutId, amount, 'pending']
          );

          // Return immediately with a simulated checkout ID
          return {
            success: true,
            message: 'STK Push initiated successfully (SIMULATED MODE)',
            checkoutRequestId: mockCheckoutId,
            isSimulated: true,
          };
        }
        throw authError;
      }

      // If we got here, we have a real access token and valid credentials! Let's hit Safaricom APIs
      const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
      const body = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: orderNumber,
        TransactionDesc: `Payment for Cyber Cafe Order ${orderNumber}`,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Daraja STK Push Request failed: ${response.status} - ${errorText}`);
      }

      const resData = (await response.json()) as StkPushResponse;

      if (resData.ResponseCode === '0') {
        // Store payment tracking in pending status, using CheckoutRequestID
        await pool.query(
          `INSERT INTO payments (order_id, mpesa_receipt, amount, status) 
           VALUES ($1, $2, $3, $4)`,
          [orderId, resData.CheckoutRequestID, amount, 'pending']
        );

        return {
          success: true,
          message: 'STK Push sent to customer handset.',
          checkoutRequestId: resData.CheckoutRequestID,
          isSimulated: false,
        };
      } else {
        return {
          success: false,
          message: resData.ResponseDescription || 'Failed to trigger STK Push.',
          isSimulated: false,
        };
      }
    } catch (error) {
      console.error('Error initiating STK push:', error);
      return {
        success: false,
        message: `M-Pesa error: ${(error as Error).message}`,
        isSimulated: true, // Fallback to simulation if server is offline or config issues
      };
    }
  }

  /**
   * Processes the Daraja API Webhook Callback (or mock webhook call)
   */
  public static async processCallback(callbackData: any): Promise<boolean> {
    console.log('[M-PESA CALLBACK RECEIVED]', JSON.stringify(callbackData, null, 2));

    try {
      const body = callbackData.Body;
      if (!body || !body.stkCallback) {
        return false;
      }

      const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = body.stkCallback;

      // Find the payment record by CheckoutRequestID (stored in mpesa_receipt)
      const paymentRes = await pool.query(
        `SELECT * FROM payments WHERE mpesa_receipt = $1`,
        [CheckoutRequestID]
      );

      if (paymentRes.rows.length === 0) {
        console.warn(`Payment record with CheckoutRequestID ${CheckoutRequestID} not found`);
        return false;
      }

      const payment = paymentRes.rows[0];
      const orderId = payment.order_id;

      if (ResultCode === 0) {
        // Success!
        // Extract receipt number from CallbackMetadata
        let actualReceipt = CheckoutRequestID; // default fallback
        if (CallbackMetadata && CallbackMetadata.Item) {
          const receiptItem = CallbackMetadata.Item.find((item: any) => item.Name === 'MpesaReceiptNumber');
          if (receiptItem) {
            actualReceipt = receiptItem.Value;
          }
        }

        // 1. Update Payment status
        await pool.query(
          `UPDATE payments SET status = 'completed', mpesa_receipt = $1, created_at = NOW() WHERE id = $2`,
          [actualReceipt, payment.id]
        );

        // 2. Update Order status and payment_status
        await pool.query(
          `UPDATE orders SET payment_status = 'paid', order_status = 'paid' WHERE id = $1`,
          [orderId]
        );

        console.log(`Order ${orderId} successfully paid via M-Pesa. Receipt: ${actualReceipt}`);

        // 3. Emit real-time event via socket
        if (this.io) {
          this.io.emit('order_paid', { orderId, receipt: actualReceipt });
          this.io.emit('queue_update');
        }

        return true;
      } else {
        // Failed STK Push (cancelled by customer, timeout, insufficient funds)
        await pool.query(
          `UPDATE payments SET status = 'failed' WHERE id = $1`,
          [payment.id]
        );

        await pool.query(
          `UPDATE orders SET payment_status = 'failed' WHERE id = $1`,
          [orderId]
        );

        console.log(`Order ${orderId} M-Pesa payment failed: ${ResultDesc}`);

        if (this.io) {
          this.io.emit('order_payment_failed', { orderId, reason: ResultDesc });
        }

        return false;
      }
    } catch (error) {
      console.error('Error processing M-Pesa callback:', error);
      return false;
    }
  }

  /**
   * Helper to simulate a successful payment locally (for the sandbox fallback)
   */
  public static async simulateSuccessfulPayment(checkoutRequestId: string): Promise<boolean> {
    console.log(`[M-PESA SIMULATOR] Manually simulating success for: ${checkoutRequestId}`);
    const receiptNum = `MPESA_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Mock callback structure that Daraja would send
    const mockCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: '12345-67890-12345',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1.00 },
              { Name: 'MpesaReceiptNumber', Value: receiptNum },
              { Name: 'TransactionDate', Value: 20260610120000 },
              { Name: 'PhoneNumber', Value: 254712345678 }
            ]
          }
        }
      }
    };

    return this.processCallback(mockCallback);
  }

  /**
   * Helper to simulate a failed payment locally
   */
  public static async simulateFailedPayment(checkoutRequestId: string, reason: string = 'User cancelled'): Promise<boolean> {
    console.log(`[M-PESA SIMULATOR] Manually simulating failure for: ${checkoutRequestId}`);
    
    const mockCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: '12345-67890-12345',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 1032, // standard Daraja cancel code
          ResultDesc: reason,
          CallbackMetadata: null
        }
      }
    };

    return this.processCallback(mockCallback);
  }
}
