import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { analyzeUploadedDocument } from '../services/documentAnalyzer';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_jwt_secret_2026_kenya_cyber_cafe';

/**
 * Public Route: Upload a document (no account required)
 */
export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded. Please select a valid document.' });
    }

    const tempFilePath = req.file.path;
    const originalName = req.file.originalname;

    // Analyze document (malware scanning + magic-bytes verification + page detection)
    const analysis = await analyzeUploadedDocument(tempFilePath, originalName);

    // If analysis failed or file is unsafe, delete the file immediately from disk
    if (!analysis.isSafe) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (unlinkErr) {
        console.error('Error deleting unsafe file from disk:', unlinkErr);
      }

      PrintService.logAction('SECURITY_ALERT', `Blocked and deleted malicious file upload attempt: ${originalName}. Log: ${analysis.malwareCheckLog}`);

      return res.status(400).json({
        success: false,
        error: 'File security check failed. The file is blocked as a potential security risk.',
        details: analysis.malwareCheckLog,
      });
    }

    // Return the secure details so the client can build the pricing breakdown and checkout
    res.status(200).json({
      success: true,
      message: 'File uploaded and validated successfully.',
      file: {
        originalName: originalName,
        filePath: req.file.filename, // we only send the filename, never the full system path
        size: analysis.fileSize,
        mimetype: analysis.fileType,
        pages: analysis.pages,
        colorPages: analysis.colorPages,
        bwPages: analysis.bwPages,
        isSafe: analysis.isSafe,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff-only Route: Securely stream an uploaded document to view/print (JWT Auth required)
 */
export async function secureStreamDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params; // order id or document id
    const cyberId = req.user!.cyber_id;

    // Retrieve document path from database
    const docRes = await pool.query(
      `SELECT d.*, o.order_number 
       FROM documents d
       JOIN orders o ON d.order_id = o.id
       WHERE d.order_id = $1 OR d.id = $1`,
      [id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const doc = docRes.rows[0];
    const filename = doc.file_path;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const absolutePath = path.resolve(uploadDir, filename);

    // Check if file exists on disk
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'File not found on physical server disk.' });
    }

    // Business Log
    PrintService.logAction(
      'DOCUMENT_STREAMED',
      `Staff streamed document for Order ${doc.order_number}`,
      req.user!.id
    );

    // Set headers and stream file
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
}

/**
 * Staff-only Route: Get a short-lived signed access token for printing
 * (Can be parsed by the Windows/CUPS agent without sending the master JWT token)
 */
export async function getSignedFileToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params; // document ID

    const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const doc = docRes.rows[0];

    // Generate signed file token with short expiry (e.g., 5 minutes)
    const signedToken = jwt.sign(
      {
        documentId: doc.id,
        filePath: doc.file_path,
        purpose: 'print_agent_fetch',
      },
      JWT_SECRET,
      { expiresIn: '5m' }
    );

    res.status(200).json({
      success: true,
      signedUrl: `/api/documents/stream-by-token?token=${signedToken}`,
      token: signedToken,
      expiresIn: '5 minutes',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Agent/Public Route: Stream document via signed short-lived token
 */
export async function streamByToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Access token is required.' });
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(String(token), JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, error: 'Invalid or expired file token.' });
    }

    if (decoded.purpose !== 'print_agent_fetch') {
      return res.status(403).json({ success: false, error: 'Unauthorized token purpose.' });
    }

    const filename = decoded.filePath;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const absolutePath = path.resolve(uploadDir, filename);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'File not found on physical server disk.' });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="print_job_${filename}"`);

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
}
