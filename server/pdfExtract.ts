/** Extract selectable PDF text for the smart indexer using Poppler. */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 200;
const EXTRACTION_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

/** Extract at most `maxPages` pages; image-only scans require external OCR. */
export async function extractPdfText(pdfBuffer: Buffer, maxPages: number = 30): Promise<string> {
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("الملف ليس ملف PDF صالحاً. ارفع ملف PDF يحتوي على نص قابل للتحديد.");
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    throw new Error("حجم ملف PDF يتجاوز الحد المسموح وهو 50 ميغابايت.");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) {
    throw new Error("عدد الصفحات يجب أن يكون عدداً صحيحاً من 1 إلى 200.");
  }

  const directory = await mkdtemp(join(tmpdir(), "teachassist-pdf-"));
  try {
    const inputPath = join(directory, "input.pdf");
    await writeFile(inputPath, pdfBuffer, { mode: 0o600 });

    let text: string;
    try {
      // A fixed executable and separate arguments prevent shell interpolation.
      // Writing to stdout also bounds extracted text through maxBuffer.
      text = await new Promise<string>((resolve, reject) => {
        execFile(
          "pdftotext",
          ["-f", "1", "-l", String(maxPages), "-enc", "UTF-8", inputPath, "-"],
          {
            encoding: "utf8",
            timeout: EXTRACTION_TIMEOUT_MS,
            maxBuffer: MAX_OUTPUT_BYTES,
            shell: false,
          },
          (error, stdout) => error ? reject(error) : resolve(stdout),
        );
      });
    } catch (error) {
      const processError = error as NodeJS.ErrnoException & { killed?: boolean };
      if (processError.code === "ENOENT") {
        throw new Error("استخراج نص PDF غير متاح حالياً لأن أداة Poppler (pdftotext) غير مثبتة على الخادم.");
      }
      if (processError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
        throw new Error("النص المستخرج من PDF كبير جداً. جرّب تقليل عدد الصفحات.");
      }
      if (processError.killed) {
        throw new Error("استغرق استخراج نص PDF وقتاً طويلاً. جرّب تقليل عدد الصفحات أو رفع ملف أصغر.");
      }
      // Do not expose process output, local paths or raw parser errors.
      throw new Error("تعذّر استخراج نص PDF. تأكد من سلامة الملف وأنه غير محمي بكلمة مرور.");
    }

    if (!text.trim()) {
      throw new Error("لا يحتوي PDF على نص قابل للاستخراج. إذا كان مسحاً ضوئياً أو صوراً، حوّله إلى نص باستخدام OCR ثم أعد رفعه؛ الفهرسة الحالية لا تدعم OCR.");
    }
    return text;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
