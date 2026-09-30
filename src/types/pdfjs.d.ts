declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export const version: string;
  export function getDocument(src: unknown): { promise: Promise<PDFDocumentProxy> };
  export type PDFDocumentProxy = {
    numPages: number;
    getPage(n: number): Promise<PDFPageProxy>;
  };
  export type PDFPageProxy = {
    getViewport(opts: { scale: number }): { width: number; height: number };
    render(opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  };
}
