import { BadRequestException, Injectable } from "@nestjs/common";
import { MAX_PDF_PAGES, MAX_SOURCE_CHARS, MAX_UPLOAD_BYTES } from "./draft.constants";

/**
 * Turns an uploaded job description into plain text.
 *
 * The file is untrusted on two axes and both are handled here. Structurally: the
 * format is decided by sniffing the bytes, never by the client's `mimetype` or
 * file extension, and every parser error is replaced by a curated message so
 * library internals and file paths never reach the caller. Semantically: the
 * extracted text is stripped and capped before anything else sees it — whatever
 * it says, it stays data, and only the draft normalizer decides what may become
 * template content.
 */

export type DocumentFormat = "pdf" | "docx" | "text";

export interface UploadedDocument {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer: Buffer;
}

export interface ExtractedDocument {
  text: string;
  format: DocumentFormat;
  fileName: string;
  /** True when the document was longer than the caps and only part of it was kept. */
  truncated: boolean;
}

const PDF_MAGIC = "%PDF-";
// DOCX is a ZIP container; mammoth rejects a zip that is not actually a document.
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const ZIP_EMPTY_MAGIC = [0x50, 0x4b, 0x05, 0x06];

/** Above this share of undecodable bytes, a "text" file is really a binary. */
const MAX_BINARY_RATIO = 0.1;
const BINARY_SNIFF_BYTES = 4_096;

const UNREADABLE_MESSAGE =
  "We couldn't read any text from that file. If it is a scanned document or an image, paste the job description as text instead.";

@Injectable()
export class DocumentExtractionService {
  async extract(file: UploadedDocument | undefined): Promise<ExtractedDocument> {
    if (!file?.buffer?.length) throw new BadRequestException("Upload a document, or describe the role as text.");
    // multer's own limit should have caught this; re-checked because the cap is a
    // security property and this service is also called directly from tests.
    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(`That file is larger than ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
    }

    const fileName = safeFileName(file.originalname);
    const format = detectFormat(file.buffer);
    const raw = await this.readText(file.buffer, format);
    const text = sanitize(raw);

    if (!text) throw new BadRequestException(UNREADABLE_MESSAGE);

    return {
      text: text.slice(0, MAX_SOURCE_CHARS),
      format,
      fileName,
      truncated: text.length > MAX_SOURCE_CHARS,
    };
  }

  private async readText(buffer: Buffer, format: DocumentFormat): Promise<string> {
    switch (format) {
      case "pdf":
        return readPdf(buffer);
      case "docx":
        return readDocx(buffer);
      default:
        return buffer.toString("utf8");
    }
  }
}

export function detectFormat(buffer: Buffer): DocumentFormat {
  if (buffer.subarray(0, PDF_MAGIC.length).toString("latin1") === PDF_MAGIC) return "pdf";
  if (startsWith(buffer, ZIP_MAGIC) || startsWith(buffer, ZIP_EMPTY_MAGIC)) return "docx";
  if (looksBinary(buffer)) {
    throw new BadRequestException("That file type isn't supported. Upload a PDF, a Word document, or a plain text file.");
  }
  return "text";
}

async function readPdf(buffer: Buffer): Promise<string> {
  // Imported lazily: pdfjs is a heavy dependency and most requests never upload a PDF.
  const { PDFParse } = await import("pdf-parse");
  // A copy, because the parser may transfer ownership of the array to its worker.
  const parser = new PDFParse({ data: Uint8Array.from(buffer) });
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    return result.text ?? "";
  } catch (error) {
    throw pdfError(error);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function readDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch {
    throw new BadRequestException("We couldn't read that Word document. Re-save it as .docx or PDF and try again.");
  }
}

function pdfError(error: unknown): BadRequestException {
  const message = error instanceof Error ? error.message : "";
  if (/password/i.test(message)) {
    throw new BadRequestException("That PDF is password protected. Remove the password and upload it again.");
  }
  return new BadRequestException("We couldn't read that PDF. Try re-exporting it, or paste the job description as text.");
}

/**
 * Text that survives extraction: no control or invisible characters, no runaway
 * whitespace. Kept deliberately conservative — this text is stored and later sent
 * to a model, so anything with no place in a job description is removed early.
 */
export function sanitize(raw: string): string {
  return (
    raw
      // Line endings first: a carriage return is itself a control character, so
      // stripping it before this step would break CRLF pairs into stray spaces
      // and hide the blank lines that separate sections of a job description.
      .replace(/\r\n?/g, "\n")
      // Replaced with a space rather than deleted, so a zero-width character
      // hidden between two words cannot silently fuse them into one.
      .replace(CONTROL_AND_INVISIBLE, " ")
      .replace(/[ \t]{2,}/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      // After line trimming, so whitespace-only lines count as blank.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

// eslint-disable-next-line no-control-regex
const CONTROL_AND_INVISIBLE = new RegExp("[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "g");

/** Decodes a sample as UTF-8 and reports whether it came back mostly as garbage. */
function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, BINARY_SNIFF_BYTES);
  const decoded = sample.toString("utf8");
  let suspect = 0;
  for (const character of decoded) {
    const code = character.codePointAt(0) ?? 0;
    // U+FFFD is what an invalid byte sequence decodes to; NUL never appears in text.
    if (code === 0xfffd || code === 0x00) suspect += 1;
  }
  return decoded.length > 0 && suspect / decoded.length > MAX_BINARY_RATIO;
}

function startsWith(buffer: Buffer, magic: number[]): boolean {
  return magic.every((byte, index) => buffer[index] === byte);
}

/** Filenames are echoed back to the client and stored, so strip path and markup. */
function safeFileName(name: string | undefined): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(CONTROL_AND_INVISIBLE, "").replace(/[<>"|?*]/g, "").trim();
  return cleaned.slice(0, 200) || "uploaded-document";
}
