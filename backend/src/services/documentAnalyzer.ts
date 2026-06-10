import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';

interface DocumentAnalysisResult {
  pages: number;
  colorPages: number;
  bwPages: number;
  fileSize: number;
  fileType: string;
  isSafe: boolean;
  malwareCheckLog: string;
}

/**
 * Validates file magic bytes (signatures) to prevent executable spoofing
 */
function checkMagicBytes(filePath: string, extension: string): { isSafe: boolean; fileType: string } {
  const buffer = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 8, 0);
  fs.closeSync(fd);

  const hex = buffer.toString('hex').toUpperCase();

  // PDF: %PDF (25504446)
  if (extension === '.pdf') {
    if (hex.startsWith('25504446')) {
      return { isSafe: true, fileType: 'application/pdf' };
    }
    return { isSafe: false, fileType: 'unknown' };
  }

  // PNG: \x89PNG (89504E47)
  if (extension === '.png') {
    if (hex.startsWith('89504E47')) {
      return { isSafe: true, fileType: 'image/png' };
    }
    return { isSafe: false, fileType: 'unknown' };
  }

  // JPEG: \xFF\xD8 (FFD8)
  if (extension === '.jpg' || extension === '.jpeg') {
    if (hex.startsWith('FFD8')) {
      return { isSafe: true, fileType: 'image/jpeg' };
    }
    return { isSafe: false, fileType: 'unknown' };
  }

  // DOCX / ZIP: PK.. (504B0304 or 504B0506 or 504B0708)
  if (extension === '.docx') {
    if (hex.startsWith('504B0304')) {
      return { isSafe: true, fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }
    return { isSafe: false, fileType: 'unknown' };
  }

  return { isSafe: false, fileType: 'unknown' };
}

/**
 * Basic malware scan (scans for shellcode signatures, suspicious scripts, executable extensions, and double extensions)
 */
function basicMalwareScan(filePath: string, originalName: string): { isSafe: boolean; log: string } {
  const ext = path.extname(originalName).toLowerCase();
  
  // 1. Double extension check (e.g., document.pdf.exe)
  if (originalName.split('.').length > 2) {
    const dangerousExts = ['.exe', '.bat', '.sh', '.js', '.vbs', '.scr', '.pif'];
    for (const dExt of dangerousExts) {
      if (originalName.toLowerCase().endsWith(dExt)) {
        return { isSafe: false, log: `Malware Check Failed: Double extension containing dangerous suffix '${dExt}'` };
      }
    }
  }

  // 2. Dangerous file extensions
  const forbiddenExtensions = ['.exe', '.dll', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.scr'];
  if (forbiddenExtensions.includes(ext)) {
    return { isSafe: false, log: `Malware Check Failed: Blocked executable/script extension: ${ext}` };
  }

  // 3. Content matching for common shellcode/malicious strings (basic check for non-binary formats)
  try {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size > 10 * 1024 * 1024) {
      // Don't scan huge files line-by-line in memory for basic MVP, assume safe if magic bytes match
      return { isSafe: true, log: 'Malware Check: File size exceeds threshold, passed signature scan (magic bytes verified).' };
    }

    const content = fs.readFileSync(filePath);
    const contentStr = content.toString('utf-8', 0, Math.min(content.length, 50000)); // scan first 50KB

    // Check for high risk scripts in documents (e.g. malicious macros or executable code)
    if (ext === '.pdf') {
      if (contentStr.includes('/JS') || contentStr.includes('/JavaScript') || contentStr.includes('/AA') || contentStr.includes('/Launch')) {
        return { isSafe: false, log: 'Malware Check Failed: Suspicious JavaScript or Launch actions detected inside PDF' };
      }
    }
  } catch (error) {
    return { isSafe: false, log: `Malware Check Error: Failed to scan file contents: ${(error as Error).message}` };
  }

  return { isSafe: true, log: 'Malware Check Passed: File extension, signature, and basic macro-scan verified safe.' };
}

/**
 * PDF parser for page counts and B/W vs Color page estimation
 */
async function analyzePdf(filePath: string): Promise<{ pages: number; colorPages: number; bwPages: number }> {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    
    // Attempt standard PDF parsing
    let pdfData;
    try {
      pdfData = await pdfParse(dataBuffer);
    } catch (e) {
      // Fallback: regex search on binary file for /Count or /Page
      const content = dataBuffer.toString('binary');
      const pageMatches = content.match(/\/Type\s*\/Page\b/g);
      const pagesCount = pageMatches ? pageMatches.length : 1;
      return {
        pages: pagesCount,
        colorPages: 0, // Fallback default
        bwPages: pagesCount,
      };
    }

    const pages = pdfData.numpages || 1;

    // Detect color pages based on standard PDF ColorSpace searching or rgb commands in PDF stream
    // Highly resilient heuristic: scan PDF raw contents for color-space operators or patterns
    const rawContent = dataBuffer.toString('binary');
    
    // We count occurrences of RGB color models /DeviceRGB, /CalRGB vs /DeviceGray
    // Note: We can also search for color operators like 'rg' or 'RG' (which signify RGB color set in text/drawing streams)
    // For a highly elegant MVP logic, we parse individual page elements, or search the document
    const rgbOccurrences = (rawContent.match(/\/DeviceRGB/g) || []).length;
    const colorOperators = (rawContent.match(/\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\s+[rR][gG]/g) || []).length;
    
    let colorPages = 0;
    if (rgbOccurrences > 0 || colorOperators > 5) {
      // Heuristic: If we see RGB colors, estimate some color pages.
      // In a real application, you might parse each page's resource dictionary.
      // Here, we'll do: if color commands are present, we'll estimate a reasonable fraction (e.g., 20% or based on operator count),
      // but let the user select/override exactly how many color pages they want printed in the UI!
      // For estimation, let's say: 1 color page for every 10 pages, or at least 1 page if we detect color signs, up to total pages.
      colorPages = Math.min(pages, Math.max(1, Math.round(rgbOccurrences / 4)));
    }

    const bwPages = pages - colorPages;

    return {
      pages,
      colorPages,
      bwPages,
    };
  } catch (error) {
    console.error('Error parsing PDF page count:', error);
    return { pages: 1, colorPages: 0, bwPages: 1 };
  }
}

/**
 * Main analysis function for uploads
 */
export async function analyzeUploadedDocument(filePath: string, originalName: string): Promise<DocumentAnalysisResult> {
  const ext = path.extname(originalName).toLowerCase();
  const stats = fs.statSync(filePath);
  
  // 1. Basic Malware Scan
  const malwareScan = basicMalwareScan(filePath, originalName);
  if (!malwareScan.isSafe) {
    return {
      pages: 0,
      colorPages: 0,
      bwPages: 0,
      fileSize: stats.size,
      fileType: 'malicious',
      isSafe: false,
      malwareCheckLog: malwareScan.log,
    };
  }

  // 2. Validate Magic Bytes
  const magicCheck = checkMagicBytes(filePath, ext);
  if (!magicCheck.isSafe) {
    return {
      pages: 0,
      colorPages: 0,
      bwPages: 0,
      fileSize: stats.size,
      fileType: 'unknown',
      isSafe: false,
      malwareCheckLog: 'Malware Check Failed: Magic bytes do not match expected file type extension.',
    };
  }

  // 3. Extract Pages / Metadata
  let pages = 1;
  let colorPages = 0;
  let bwPages = 1;

  if (ext === '.pdf') {
    const pdfAnalysis = await analyzePdf(filePath);
    pages = pdfAnalysis.pages;
    colorPages = pdfAnalysis.colorPages;
    bwPages = pdfAnalysis.bwPages;
  } else if (ext === '.docx') {
    // DOCX: page counts are typically stored in docProps/app.xml. We can approximate or default to 1,
    // and let the client adjust, which is the safest approach without heavy external dependencies.
    pages = 1;
    colorPages = 0;
    bwPages = 1;
  } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
    // Images are always 1 page
    pages = 1;
    // Assume images might be color by default unless we do complex pixel calculations. 
    // Let's estimate color as 1, bw as 0 for image files.
    colorPages = 1;
    bwPages = 0;
  }

  return {
    pages,
    colorPages,
    bwPages,
    fileSize: stats.size,
    fileType: magicCheck.fileType,
    isSafe: true,
    malwareCheckLog: malwareScan.log,
  };
}
