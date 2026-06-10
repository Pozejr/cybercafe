import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { analyzeUploadedDocuments } from '../services/documentAnalyzer';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PrintService } from '../services/printService';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secure_jwt_secret_2026_kenya_cyber_cafe';

/**
 * Public Route: Multi-file Upload & Security Scanning (Phase 2 Upgrade)
 */
export async function uploadDocument(req: Request, res: Response, next: NextFunction) {
  try {
    // Collect uploaded files from either single field 'file' or multi-field 'files'
    const files = req.files as Express.Multer.File[] || [];
    const singleFile = req.file as Express.Multer.File;
    
    const allFiles: Express.Multer.File[] = [];
    if (singleFile) allFiles.push(singleFile);
    if (files && files.length > 0) allFiles.push(...files);

    if (allFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded. Please upload valid files.' });
    }

    // Run dynamic multi-file verification and metadata extraction engine
    const analysis = await analyzeUploadedDocuments(allFiles);

    // If any file failed security checks, wipe all files immediately to prevent infection
    if (!analysis.isSafe) {
      for (const file of allFiles) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error('Error wiping uploaded files on threat detection:', err);
        }
      }

      PrintService.logAction(
        'SECURITY_ALERT',
        `Blocked and expunged threat upload. Log: ${analysis.malwareCheckLog}`
      );

      return res.status(400).json({
        success: false,
        error: 'Security verification failed. Blocked malicious file structure.',
        details: analysis.malwareCheckLog,
      });
    }

    // Return the detailed list + aggregated count to the pricing engine
    res.status(200).json({
      success: true,
      message: `${allFiles.length} files successfully processed and scanned.`,
      analysis: {
        totalPages: analysis.totalPages,
        totalColorPages: analysis.totalColorPages,
        totalBwPages: analysis.totalBwPages,
        pageSize: analysis.pageSize,
        files: analysis.files,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Staff-only Route: Direct secure file streamer (JWT Auth)
 */
export async function secureStreamDocument(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params; // document ID or order ID

    // Query file path
    const docRes = await pool.query(
      `SELECT d.*, o.order_number 
       FROM documents d
       JOIN orders o ON d.order_id = o.id
       WHERE d.order_id = $1 OR d.id = $1`,
      [id]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document record not found in database.' });
    }

    const doc = docRes.rows[0];
    const filename = doc.file_path;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const absolutePath = path.resolve(uploadDir, filename);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'File not found on physical disk.' });
    }

    PrintService.logAction('DOCUMENT_STREAMED', `Attendant streamed file for order ${doc.order_number}`, req.user!.id);

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
 * Staff Route: Issue a short-lived token (JWT Auth)
 */
export async function getSignedFileToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const doc = docRes.rows[0];

    const token = jwt.sign(
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
      signedUrl: `/api/documents/stream-by-token?token=${token}`,
      token,
      expiresIn: '5m',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Agent Route: Streaming file via short token (No login)
 */
export async function streamByToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, error: 'File token is required.' });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(String(token), JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, error: 'Invalid or expired file token.' });
    }

    if (decoded.purpose !== 'print_agent_fetch') {
      return res.status(403).json({ success: false, error: 'Unauthorized token purpose.' });
    }

    const filename = decoded.filePath;
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const absolutePath = path.resolve(uploadDir, filename);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: 'File not found on physical disk.' });
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="job-${filename}"`);

    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
}
