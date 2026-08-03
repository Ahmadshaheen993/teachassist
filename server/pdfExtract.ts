/**
 * PDF Text Extraction Module
 *
 * Extracts text from PDF files for the smart indexing feature.
 * Uses pdf-parse (a lightweight PDF text extractor).
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const execAsync = promisify(exec);

/**
 * Extract text from a PDF buffer using pdftotext (poppler-utils).
 * Limits extraction to the first `maxPages` pages.
 *
 * @param pdfBuffer - The PDF file as a Buffer
 * @param maxPages - Maximum number of pages to extract (default 30)
 * @returns Extracted text content
 */
export async function extractPdfText(pdfBuffer: Buffer, maxPages: number = 30): Promise<string> {
  // Write buffer to a temporary file
  const tmpDir = tmpdir();
  const tmpFile = join(tmpDir, `pdf_extract_${Date.now()}.pdf`);
  const outFile = join(tmpDir, `pdf_text_${Date.now()}.txt`);

  try {
    writeFileSync(tmpFile, pdfBuffer);

    // Use pdftotext from poppler-utils (pre-installed in the sandbox)
    // -f = first page, -l = last page
    const { stdout, stderr } = await execAsync(
      `pdftotext -f 1 -l ${maxPages} -enc UTF-8 "${tmpFile}" "${outFile}" 2>&1`
    );

    if (!existsSync(outFile)) {
      throw new Error(`pdftotext failed: ${stderr || stdout || "no output"}`);
    }

    // Read the extracted text
    const { readFileSync } = await import("fs");
    const text = readFileSync(outFile, "utf-8");

    return text;
  } catch (error: any) {
    // Fallback: try using Python pdf2image + pytesseract if pdftotext fails
    console.error("[pdfExtract] pdftotext failed, trying fallback:", error.message);
    return extractPdfTextFallback(pdfBuffer, maxPages);
  } finally {
    // Cleanup temp files
    try { unlinkSync(tmpFile); } catch {}
    try { unlinkSync(outFile); } catch {}
  }
}

/**
 * Fallback: Extract text using Python's pdfplumber or PyPDF2.
 */
async function extractPdfTextFallback(pdfBuffer: Buffer, maxPages: number): Promise<string> {
  const tmpDir = tmpdir();
  const tmpFile = join(tmpDir, `pdf_fallback_${Date.now()}.pdf`);

  try {
    writeFileSync(tmpFile, pdfBuffer);

    const script = `
import sys
try:
    import pdfplumber
    with pdfplumber.open(sys.argv[1]) as pdf:
        text = []
        for i, page in enumerate(pdf.pages[:${maxPages}]):
            text.append(page.extract_text() or "")
        print("\\n\\n".join(text))
except ImportError:
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(sys.argv[1])
        text = []
        for i, page in enumerate(reader.pages[:${maxPages}]):
            text.append(page.extract_text() or "")
        print("\\n\\n".join(text))
    except ImportError:
        print("ERROR: No PDF library available", file=sys.stderr)
        sys.exit(1)
`;

    const scriptFile = join(tmpDir, `extract_${Date.now()}.py`);
    writeFileSync(scriptFile, script);

    const { stdout, stderr } = await execAsync(`python3 "${scriptFile}" "${tmpFile}" 2>&1`);

    try { unlinkSync(scriptFile); } catch {}

    if (stdout.startsWith("ERROR:")) {
      throw new Error(stdout);
    }

    return stdout;
  } catch (error: any) {
    console.error("[pdfExtract] Fallback also failed:", error.message);
    throw new Error(`PDF text extraction failed: ${error.message}. Install poppler-utils or pdfplumber.`);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}
