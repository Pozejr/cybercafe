declare module 'pdf-parse' {
  interface PDFParseData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer, options?: any): Promise<PDFParseData>;

  export = pdf;
}
