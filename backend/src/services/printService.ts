import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import { Server as SocketServer } from 'socket.io';

interface PrintJob {
  id: string;
  orderId: string;
  orderNumber: string;
  filePath: string;
  pages: number;
  colorPages: number;
  bwPages: number;
  status: 'queued' | 'printing' | 'completed' | 'failed';
  printerName: string;
  createdAt: Date;
}

export class PrintService {
  private static io: SocketServer | null = null;
  private static mockPrinterQueue: PrintJob[] = [];

  public static setSocketServer(io: SocketServer) {
    this.io = io;
  }

  /**
   * Logs actions securely (business rule: "Every action must be logged")
   */
  public static logAction(action: string, details: string, userId?: string) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [USER: ${userId || 'SYSTEM'}] [ACTION: ${action}] - ${details}\n`;
    
    // Write log to a file
    const logFilePath = path.join(__dirname, '../../logs/audit.log');
    const logDir = path.dirname(logFilePath);
    
    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(logFilePath, logMessage);
      console.log(`[AUDIT LOG] ${action}: ${details}`);
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  /**
   * Adds an order's documents to the active printer queue
   */
  public static async queuePaidOrder(orderId: string, orderNumber: string): Promise<boolean> {
    try {
      // 1. Fetch document and order details
      const docRes = await pool.query(
        `SELECT d.*, o.phone, o.order_status, o.payment_status 
         FROM documents d
         JOIN orders o ON d.order_id = o.id
         WHERE d.order_id = $1`,
        [orderId]
      );

      if (docRes.rows.length === 0) {
        this.logAction('PRINT_QUEUE_ERROR', `No documents found for paid order ID: ${orderId}`);
        return false;
      }

      const doc = docRes.rows[0];

      // Business Rule: "Only paid orders can be printed"
      if (doc.payment_status !== 'paid') {
        this.logAction('PRINT_SECURITY_VIOLATION', `Attempted to queue UNPAID order ${orderNumber} for printing!`);
        return false;
      }

      // 2. Create Print Job object
      const printJob: PrintJob = {
        id: `job_${Math.random().toString(36).substr(2, 9)}`,
        orderId,
        orderNumber,
        filePath: doc.file_path,
        pages: doc.pages,
        colorPages: doc.color_pages,
        bwPages: doc.bw_pages,
        status: 'queued',
        printerName: 'Default Cyber Printer',
        createdAt: new Date(),
      };

      this.mockPrinterQueue.push(printJob);
      this.logAction('PRINT_JOB_QUEUED', `Order ${orderNumber} successfully sent to automated printer queue. Total Pages: ${doc.pages}`);

      // 3. Trigger Real-Time notification to Cyber Café Staff / Windows Print Agent / Linux CUPS Agent
      if (this.io) {
        this.io.emit('print_job_added', printJob);
        this.io.emit('queue_update');
      }

      // Future-ready feature: If a CUPS or Windows print agent is connected, they will receive this event
      // and immediately download the file using a secured token and print it!

      return true;
    } catch (error) {
      console.error('Error adding order to print queue:', error);
      this.logAction('PRINT_QUEUE_ERROR', `Failed to queue order ID: ${orderId}. Error: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Get all active print jobs in the queue
   */
  public static getQueue(): PrintJob[] {
    return this.mockPrinterQueue;
  }

  /**
   * Update print job status (used by attendants or print agents)
   */
  public static async updateJobStatus(
    jobId: string,
    status: 'printing' | 'completed' | 'failed',
    printerName?: string,
    userId?: string
  ): Promise<boolean> {
    const jobIndex = this.mockPrinterQueue.findIndex((job) => job.id === jobId);
    
    if (jobIndex === -1) {
      this.logAction('PRINT_JOB_NOT_FOUND', `Attempted to update status of non-existent print job: ${jobId}`, userId);
      return false;
    }

    const job = this.mockPrinterQueue[jobIndex];
    job.status = status;
    if (printerName) {
      job.printerName = printerName;
    }

    this.logAction(
      'PRINT_JOB_STATUS_UPDATED',
      `Print Job ${jobId} (Order ${job.orderNumber}) updated to: ${status} on printer: ${job.printerName}`,
      userId
    );

    // If job is completed, update the main order status from 'paid' to 'processing' or 'ready' or 'completed'
    if (status === 'completed') {
      await pool.query(
        `UPDATE orders SET order_status = 'ready' WHERE id = $1`,
        [job.orderId]
      );
      this.logAction('ORDER_STATUS_UPDATED', `Order ${job.orderNumber} status changed to READY (Print job completed)`, userId);
    }

    if (this.io) {
      this.io.emit('print_job_status_changed', job);
      this.io.emit('queue_update');
    }

    return true;
  }

  /**
   * Clears completed/failed jobs from queue
   */
  public static clearFinishedJobs(userId?: string) {
    const originalCount = this.mockPrinterQueue.length;
    this.mockPrinterQueue = this.mockPrinterQueue.filter((job) => job.status === 'queued' || job.status === 'printing');
    const cleared = originalCount - this.mockPrinterQueue.length;
    this.logAction('PRINT_QUEUE_CLEANUP', `Cleared ${cleared} completed or failed jobs from the queue.`, userId);
    
    if (this.io) {
      this.io.emit('queue_update');
    }
  }
}
