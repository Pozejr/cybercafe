import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { PrintService } from './printService';

export interface FilePageBreakdown {
  file: string;
  pages: number;
  type: string;
  isSafe: boolean;
  status: 'success' | 'failed' | 'password_protected' | 'empty';
}

export interface PageAnalysis {
  totalPages: number;
  breakdown: FilePageBreakdown[];
}

export class DocumentPageCounter {
  
  /**
   * Universal router to count pages accurately across PDF, DOCX, images, and scanned uploads
   */
  public static async calculateTotalPages(files: Express.Multer.File[]): Promise<PageAnalysis> {
    const breakdown: FilePageBreakdown[] = [];
    let totalPages = 0;

    for (const file of files) {
      const originalName = file.originalname;
      const ext = path.extname(originalName).toLowerCase();
      const mimeType = file.mimetype || '';
      
      let pages = 0;
      let status: 'success' | 'failed' | 'password_protected' | 'empty' = 'success';
      let detectedType = 'unknown';

      try {
        const stats = fs.statSync(file.path);
        
        // 1. Edge Case: Empty File
        if (stats.size === 0) {
          pages = 0;
          status = 'empty';
          detectedType = 'empty_file';
          this.logResult(originalName, detectedType, pages, 'REJECTED: Empty file size.');
          breakdown.push({ file: originalName, pages, type: detectedType, isSafe: false, status });
          continue;
        }

        // 2. Identify file formats
        const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
        const isWord = mimeType.includes('word') || mimeType.includes('officedocument') || ext === '.docx';
        const isImage = mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg'].includes(ext);

        // A. PDF FILE ROUTING
        if (isPdf) {
          detectedType = 'PDF';
          const buffer = fs.readFileSync(file.path);
          
          // PDF Encryption / Password-Protection Checker
          const headerStr = buffer.toString('binary', 0, Math.min(buffer.length, 1024));
          if (headerStr.includes('/Encrypt')) {
            pages = 0;
            status = 'password_protected';
            this.logResult(originalName, detectedType, pages, 'WARNING: Document is password-protected/encrypted.');
          } else {
            try {
              const pdfData = await pdfParse(buffer);
              pages = pdfData.numpages || 1;
              
              // Handle image-only or scanned PDFs gracefully
              const textLength = (pdfData.text || '').trim().length;
              const isScannedPdf = textLength < pages * 5; // average less than 5 characters per page
              if (isScannedPdf) {
                this.logResult(originalName, detectedType, pages, `Scanned PDF detected (no text streams). Treating sheets as 1 page per canvas.`);
              } else {
                this.logResult(originalName, detectedType, pages, `Text-searchable PDF parsed successfully.`);
              }
            } catch (pdfErr) {
              // Fail-safe PDF binary fallback regex extraction
              const binaryContent = buffer.toString('binary');
              const pageMatches = binaryContent.match(/\/Type\s*\/Page\b/g);
              pages = pageMatches ? pageMatches.length : 1;
              this.logResult(originalName, detectedType, pages, `Corrupted/Non-conforming PDF buffer binary fallback. Pages: ${pages}`);
            }
          }
        } 
        
        // B. DOCX WORD FILE ROUTING
        else if (isWord) {
          detectedType = 'DOCX';
          const buffer = fs.readFileSync(file.path);
          
          try {
            // Extact raw word text using mammoth
            const result = await mammoth.extractRawText({ buffer });
            const textContent = result.value || '';
            
            // 1. Detect explicit page breaks via mammoth XML inspection or simple delimiters
            // standard DOCX file breaks usually render page symbols or double breaks
            const wordsCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
            
            // Configurable estimation metrics: 1 page approx 550 words
            const wordEstimation = Math.max(1, Math.ceil(wordsCount / 550));
            
            // Read XML structure to locate hard page breaks <w:br type="page"/>
            const htmlResult = await mammoth.convertToHtml({ buffer });
            const htmlContent = htmlResult.value || '';
            const hardPageBreaksCount = (htmlContent.match(/class="page-break"/g) || []).length || 
                                        (htmlContent.match(/<hr\s*\/?>/g) || []).length;

            // Normalize results - hard page breaks provide absolute anchors, word estimations serve as the safe boundary
            pages = Math.max(wordEstimation, hardPageBreaksCount + 1);
            
            this.logResult(originalName, detectedType, pages, `Word document parsed. Word Count: ${wordsCount}, Hard Breaks: ${hardPageBreaksCount}`);
          } catch (wordErr) {
            pages = 1;
            status = 'failed';
            this.logResult(originalName, detectedType, pages, `ERROR: Mammoth failed parsing DOCX. Defaulted to 1 page.`);
          }
        } 
        
        // C. IMAGE FILE ROUTING
        else if (isImage) {
          detectedType = 'Image';
          pages = 1; // standard image is exactly 1 page
          this.logResult(originalName, detectedType, pages, `Image page count normalized (1 image = 1 page).`);
        } 
        
        // D. REJECTED / UNKNOWN FILE FORMATS
        else {
          detectedType = 'Unsupported';
          pages = 1;
          status = 'failed';
          this.logResult(originalName, detectedType, pages, `REJECTED: Unsupported format: ${ext}`);
        }

      } catch (fileErr) {
        pages = 0;
        status = 'failed';
        detectedType = 'error';
        this.logResult(originalName, detectedType, pages, `CRITICAL: Failed processing file attributes: ${(fileErr as Error).message}`);
      }

      totalPages += pages;
      breakdown.push({
        file: originalName,
        pages,
        type: detectedType,
        isSafe: (status as string) !== 'failed' && (status as string) !== 'empty',
        status,
      });
    }

    return {
      totalPages,
      breakdown,
    };
  }

  /**
   * Internal logging mechanism (regulatory business requirement)
   */
  private static logResult(filename: string, fileType: string, pages: number, note: string) {
    const timestamp = new Date().toISOString();
    const logDetails = `[FILE: ${filename}] [TYPE: ${fileType}] [PAGES: ${pages}] - ${note}`;
    
    // Log to backend file
    PrintService.logAction('PAGE_COUNT_CALCULATION', logDetails);
  }
}
