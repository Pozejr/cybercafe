declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: any[];
  }

  export function extractRawText(options: { path?: string; buffer?: Buffer }): Promise<MammothResult>;
  export function convertToHtml(options: { path?: string; buffer?: Buffer }): Promise<MammothResult>;
}
