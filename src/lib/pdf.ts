import { GlobalWorkerOptions, type PDFPageProxy } from "pdfjs-dist"
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url"

GlobalWorkerOptions.workerSrc = pdfWorker

export { getDocument, Util } from "pdfjs-dist"
export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist"

export type PdfPageViewport = ReturnType<PDFPageProxy["getViewport"]>
export type PdfTextItems = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"]
