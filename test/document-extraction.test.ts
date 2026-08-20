import { test } from "node:test";
import { strict as assert } from "node:assert";
import { deflateRawSync, crc32 } from "node:zlib";
import {
  DocumentExtractionService,
  detectFormat,
  sanitize,
} from "../src/modules/templates/drafts/document-extraction.service";
import { MAX_SOURCE_CHARS, MAX_UPLOAD_BYTES } from "../src/modules/templates/drafts/draft.constants";

const service = new DocumentExtractionService();

function upload(buffer: Buffer, originalname = "job-description.txt", mimetype = "text/plain") {
  return { buffer, originalname, mimetype, size: buffer.length };
}

test("plain text uploads round-trip", async () => {
  const result = await service.extract(upload(Buffer.from("Backend Engineer\n\nOwns the payments service.", "utf8")));

  assert.equal(result.format, "text");
  assert.equal(result.text, "Backend Engineer\n\nOwns the payments service.");
  assert.equal(result.fileName, "job-description.txt");
  assert.equal(result.truncated, false);
});

test("format comes from the bytes, not from what the client claims", () => {
  // An executable renamed to .pdf and labelled application/pdf.
  const executable = Buffer.concat([Buffer.from("MZ", "latin1"), Buffer.alloc(600)]);
  assert.throws(() => detectFormat(executable), /isn't supported/i);

  assert.equal(detectFormat(Buffer.from("%PDF-1.7\n...", "latin1")), "pdf");
  assert.equal(detectFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])), "docx");
  assert.equal(detectFormat(Buffer.from("Just a job description.", "utf8")), "text");
});

test("a binary file rejects before any parsing or model call", async () => {
  const binary = Buffer.concat([Buffer.from("MZ", "latin1"), Buffer.alloc(2_048)]);
  await assert.rejects(() => service.extract(upload(binary, "resume.pdf", "application/pdf")), /isn't supported/i);
});

test("an empty upload is rejected with actionable guidance", async () => {
  await assert.rejects(() => service.extract(undefined), /Upload a document/i);
  await assert.rejects(() => service.extract(upload(Buffer.alloc(0))), /Upload a document/i);
});

test("a file with no readable text is rejected rather than sent on as an empty draft", async () => {
  await assert.rejects(() => service.extract(upload(Buffer.from("   \n\t  \n ", "utf8"))), /couldn't read any text/i);
});

test("oversized uploads are refused even if multer's limit is bypassed", async () => {
  const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);
  await assert.rejects(() => service.extract(upload(huge)), /larger than/i);
});

test("extracted text is capped and reported as truncated", async () => {
  const long = Buffer.from("word ".repeat(MAX_SOURCE_CHARS), "utf8");
  const result = await service.extract(upload(long));

  assert.equal(result.text.length, MAX_SOURCE_CHARS);
  assert.equal(result.truncated, true);
});

test("filenames are stripped of directory components before being stored", async () => {
  const result = await service.extract(upload(Buffer.from("Backend engineer", "utf8"), "../../etc/passwd.txt"));
  assert.equal(result.fileName, "passwd.txt");

  const unnamed = await service.extract(upload(Buffer.from("Backend engineer", "utf8"), ""));
  assert.equal(unnamed.fileName, "uploaded-document");
});

test("sanitize removes control and invisible characters and collapses whitespace", () => {
  const zeroWidth = String.fromCharCode(0x200b);
  const bell = String.fromCharCode(0x07);
  const cleaned = sanitize(`Backend${zeroWidth}Engineer${bell}\r\n\r\n\r\n   Owns    payments`);

  assert.ok(!cleaned.includes(zeroWidth) && !cleaned.includes(bell));
  assert.equal(cleaned, "Backend Engineer\n\nOwns payments");
});

test("a real PDF is parsed into text", async () => {
  const result = await service.extract(upload(buildPdf("Backend Engineer owns the payments service."), "jd.pdf", "application/pdf"));

  assert.equal(result.format, "pdf");
  assert.match(result.text, /Backend Engineer owns the payments service/);
});

test("a real DOCX is parsed into text", async () => {
  const result = await service.extract(
    upload(
      buildDocx("Backend Engineer", "Owns the payments service."),
      "jd.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );

  assert.equal(result.format, "docx");
  assert.match(result.text, /Backend Engineer/);
  assert.match(result.text, /Owns the payments service/);
});

test("a zip that is not a Word document reports a readable error", async () => {
  const notADocx = buildZip([{ name: "hello.txt", content: Buffer.from("hi", "utf8") }]);
  await assert.rejects(() => service.extract(upload(notADocx, "archive.docx")), /couldn't read that Word document/i);
});

/** A minimal single-page PDF with one text-showing operator. */
function buildPdf(text: string): Buffer {
  const escaped = text.replace(/([()\\])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/** A minimal .docx: the three parts Word needs, zipped without external tooling. */
function buildDocx(...paragraphs: string[]): Buffer {
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  return buildZip([
    {
      name: "[Content_Types].xml",
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "utf8",
      ),
    },
    {
      name: "_rels/.rels",
      content: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "utf8",
      ),
    },
    {
      name: "word/document.xml",
      content: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
        "utf8",
      ),
    },
  ]);
}

/** Deflate-compressed ZIP writer — enough of the spec for the parsers under test. */
function buildZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.content);
    const checksum = crc32(entry.content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    locals.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centrals.push(centralHeader, name);

    offset += localHeader.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDirectory, end]);
}
