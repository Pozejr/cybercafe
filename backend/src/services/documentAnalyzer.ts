import fs from 'fs';
import path from 'path';
import { DocumentPageCounter, FilePageBreakdown } from './documentPageCounter';

export interface FileAnalysisDetail {
  originalName: string;
  filePath: string;
  size: number;
  mimetype: string;
  pages: number;
  colorPages: number;
  bwPages: number;
  pageSize: string; // A4, A3, etc.
  isSafe: boolean;
}

export interface DocumentAnalysisResult {
  totalPages: number;
  totalColorPages: number;
  totalBwPages: number;
  pageSize: string;
  isSafe: boolean;
  malwareCheckLog: string;
  files: FileAnalysisDetail[];
}

/**
 * Validates file magic bytes (signatures)
 */
function checkMagicBytes(filePath: string, extension: string): { isSafe: boolean; fileType: string } {
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  const hex = buffer.toString('hex').toUpperCase();

  if (extension === '.pdf' && hex.startsWith('25504446')) {
    return { isSafe: true, fileType: 'application/pdf' };
  }
  if (extension === '.png' && hex.startsWith('89504E47')) {
    return { isSafe: true, fileType: 'image/png' };
  }
  if ((extension === '.jpg' || extension === '.jpeg') && hex.startsWith('FFD8')) {
    return { isSafe: true, fileType: 'image/jpeg' };
  }
  if (extension === '.docx' && hex.startsWith('504B0304')) {
    return { isSafe: true, fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }

  return { isSafe: false, fileType: 'unknown' };
}

/**
 * Basic malware check
 */
function basicMalwareScan(filePath: string, originalName: string): { isSafe: boolean; log: string } {
  const ext = path.extname(originalName).toLowerCase();
  
  if (originalName.split('.').length > 2) {
    const dangerousExts = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr', '.pif'];
    for (const dExt of dangerousExts) {
      if (originalName.toLowerCase().endsWith(dExt)) {
        return { isSafe: false, log: `Malware Blocked: Double extension containing dangerous suffix '${dExt}'` };
      }
    }
  }

  const forbiddenExtensions = ['.exe', '.dll', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.scr'];
  if (forbiddenExtensions.includes(ext)) {
    return { isSafe: false, log: `Malware Blocked: Executable/script forbidden extension: ${ext}` };
  }

  try {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size <= 10 * 1024 * 1024) {
      const content = fs.readFileSync(filePath);
      const contentStr = content.toString('utf-8', 0, Math.min(content.length, 50000));

      if (ext === '.pdf' && (contentStr.includes('/JS') || contentStr.includes('/JavaScript') || contentStr.includes('/AA') || contentStr.includes('/Launch'))) {
        return { isSafe: false, log: 'Malware Blocked: JavaScript macro code detected inside PDF' };
      }
    }
  } catch (error) {
    return { isSafe: false, log: `Malware Scan Error: ${(error as Error).message}` };
  }

  return { isSafe: true, log: 'Passes security heuristics.' };
}

/**
 * Detect PDF page size based on /MediaBox coordinates
 */
function detectPdfPageSize(filePath: string): string {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const rawContent = dataBuffer.toString('binary');
    const mediaBoxRegex = /\/MediaBox\s*\[\s*(-?\d+(\.\d+)?)\s+(-?\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s+(\d+(\.\d+)?)\s*\]/g;
    let match;
    let maxW = 0;
    let maxH = 0;

    while ((match = mediaBoxRegex.exec(rawContent)) !== null) {
      const width = parseFloat(match[5]);
      const height = parseFloat(match[7]);
      if (width > maxW) maxW = width;
      if (height > maxH) maxH = height;
    }

    if (maxW > 800 || maxH > 1100) {
      return 'A3';
    }
  } catch (e) {
    console.error('Page size detection error:', e);
  }
  return 'A4';
}

/**
 * Main analysis function supporting single/multi-file arrays (Integrated with DocumentPageCounter)
 */
export async function analyzeUploadedDocuments(
  uploadedFiles: Express.Multer.File[]
): Promise<DocumentAnalysisResult> {
  const filesDetails: FileAnalysisDetail[] = [];
  let overallSafe = true;
  let malwareLog = 'All files passed magic bytes and macro virus scanning.';

  // 1. Perform Security Scans & Magic-bytes validation first
  for (const file of uploadedFiles) {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Antivirus checks
    const malwareScan = basicMalwareScan(file.path, file.originalname);
    if (!malwareScan.isSafe) {
      overallSafe = false;
      malwareLog = malwareScan.log;
      break;
    }

    // Binary headers inspection
    const magicCheck = checkMagicBytes(file.path, ext);
    if (!magicCheck.isSafe) {
      overallSafe = false;
      malwareLog = `Security alert: magic hex bytes mismatch for "${file.originalname}". Re-verify extension origin.`;
      break;
    }
  }

  // If any threat was identified, stop proceeding and report blocked state
  if (!overallSafe) {
    return {
      totalPages: 0,
      totalColorPages: 0,
      totalBwPages: 0,
      pageSize: 'A4',
      isSafe: false,
      malwareCheckLog: malwareLog,
      files: [],
    };
  }

  // 2. Delegate Page Counting logic to the new accurate Multi-Format Engine
  const countingResult = await DocumentPageCounter.calculateTotalPages(uploadedFiles);

  let totalPages = countingResult.totalPages;
  let totalColorPages = 0;
  let totalBwPages = 0;
  let resolvedPageSize = 'A4';

  // 3. Complete detail metadata and color-split estimation arrays
  for (const file of uploadedFiles) {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Find calculated page count from the Unified Page Counter breakdown
    const matchingBreakdown = countingResult.breakdown.find(b => b.file === file.originalname);
    const pages = matchingBreakdown ? matchingBreakdown.pages : 1;

    let colorPages = 0;
    let bwPages = pages;
    let pageSize = 'A4';

    if (ext === '.pdf') {
      pageSize = detectPdfPageSize(file.path);
      if (pageSize === 'A3') resolvedPageSize = 'A3';
      
      // Basic PDF Color heuristic
      try {
        const dataBuffer = fs.readFileSync(file.path);
        const rawContent = dataBuffer.toString('binary');
        const rgbOccurrences = (rawContent.match(/\/DeviceRGB/g) || []).length;
        if (rgbOccurrences > 0) {
          colorPages = Math.min(pages, Math.max(1, Math.round(rgbOccurrences / 3)));
        }
      } catch (e) {
        console.error('PDF color heuristic read error:', e);
      }
      bwPages = pages - colorPages;
    } else if (ext === '.docx') {
      colorPages = 0;
      bwPages = pages;
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      colorPages = 1; // single image page counted as color page
      bwPages = 0;
    }

    totalColorPages += colorPages;
    totalBwPages += bwPages;

    const fileType = ext === '.pdf' ? 'application/pdf' :
                     ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                     ext === '.png' ? 'image/png' : 'image/jpeg';

    filesDetails.push({
      originalName: file.originalname,
      filePath: file.filename,
      size: file.size,
      mimetype: fileType,
      pages,
      colorPages,
      bwPages,
      pageSize,
      isSafe: true,
    });
  }

  return {
    totalPages,
    totalColorPages,
    totalBwPages,
    pageSize: resolvedPageSize,
    isSafe: true,
    malwareCheckLog: malwareLog,
    files: filesDetails,
  };
}
