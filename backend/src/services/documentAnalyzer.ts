import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

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
function detectPdfPageSize(rawContent: string): string {
  // A4 point size is roughly 595 x 842
  // A3 point size is roughly 842 x 1191
  // We search for /MediaBox [ x y width height ]
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
  return 'A4'; // default to A4 standard point size
}

/**
 * PDF parser for page counts, sizes, and B/W vs Color pages (Heuristic MVP)
 */
async function analyzePdf(filePath: string): Promise<{ pages: number; colorPages: number; bwPages: number; pageSize: string }> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const rawContent = dataBuffer.toString('binary');
    const pageSize = detectPdfPageSize(rawContent);

    let pdfData;
    try {
      pdfData = await pdfParse(dataBuffer);
    } catch (e) {
      const pageMatches = rawContent.match(/\/Type\s*\/Page\b/g);
      const pagesCount = pageMatches ? pageMatches.length : 1;
      return { pages: pagesCount, colorPages: 0, bwPages: pagesCount, pageSize };
    }

    const pages = pdfData.numpages || 1;

    // MVP Color vs B/W page detection
    // RGB references or drawing/stroke commands signify color content.
    const rgbOccurrences = (rawContent.match(/\/DeviceRGB/g) || []).length;
    const colorOperators = (rawContent.match(/\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\s+[rR][gG]/g) || []).length;
    
    let colorPages = 0;
    if (rgbOccurrences > 0 || colorOperators > 5) {
      colorPages = Math.min(pages, Math.max(1, Math.round(rgbOccurrences / 3)));
    }
    const bwPages = pages - colorPages;

    return {
      pages,
      colorPages,
      bwPages,
      pageSize,
    };
  } catch (error) {
    console.error('Error in analyzePdf:', error);
    return { pages: 1, colorPages: 0, bwPages: 1, pageSize: 'A4' };
  }
}

/**
 * Main analysis function supporting single/multi-file arrays
 */
export async function analyzeUploadedDocuments(
  uploadedFiles: Express.Multer.File[]
): Promise<DocumentAnalysisResult> {
  const filesDetails: FileAnalysisDetail[] = [];
  let totalPages = 0;
  let totalColorPages = 0;
  let totalBwPages = 0;
  let resolvedPageSize = 'A4';
  let overallSafe = true;
  let malwareLog = 'All files passed.';

  for (const file of uploadedFiles) {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // 1. Run malware scan
    const malwareScan = basicMalwareScan(file.path, file.originalname);
    if (!malwareScan.isSafe) {
      overallSafe = false;
      malwareLog = malwareScan.log;
      break;
    }

    // 2. Magic byte check
    const magicCheck = checkMagicBytes(file.path, ext);
    if (!magicCheck.isSafe) {
      overallSafe = false;
      malwareLog = 'File verification failed. Blocked unknown magic headers.';
      break;
    }

    let pages = 1;
    let colorPages = 0;
    let bwPages = 1;
    let pageSize = 'A4';

    if (ext === '.pdf') {
      const pdfAnalysis = await analyzePdf(file.path);
      pages = pdfAnalysis.pages;
      colorPages = pdfAnalysis.colorPages;
      bwPages = pdfAnalysis.bwPages;
      pageSize = pdfAnalysis.pageSize;
      if (pageSize === 'A3') resolvedPageSize = 'A3';
    } else if (ext === '.docx') {
      pages = 1;
      colorPages = 0;
      bwPages = 1;
      pageSize = 'A4';
    } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      pages = 1;
      colorPages = 1; // image is counted as color page by default
      bwPages = 0;
      pageSize = 'A4';
    }

    totalPages += pages;
    totalColorPages += colorPages;
    totalBwPages += bwPages;

    filesDetails.push({
      originalName: file.originalname,
      filePath: file.filename,
      size: file.size,
      mimetype: magicCheck.fileType,
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
    isSafe: overallSafe,
    malwareCheckLog: malwareLog,
    files: filesDetails,
  };
}
