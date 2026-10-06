import { access, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { extractPdfText } from "./pdfExtract";

type Callback = (error: Error | null, stdout: string, stderr: string) => void;
const pdfBuffer = Buffer.from("%PDF-1.7\nexample PDF input");

describe("PDF text extraction", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFileMock.mockImplementation((_command, _args, _options, callback: Callback) => {
      callback(null, "فهرس الكتاب\nالوحدة الأولى", "");
    });
  });

  it("invokes Poppler without a shell, limits work, and removes the private input directory", async () => {
    let inputPath = "";
    execFileMock.mockImplementation((_command, args, _options, callback: Callback) => {
      inputPath = args[6];
      void (async () => {
        expect(await readFile(inputPath)).toEqual(pdfBuffer);
        expect((await stat(inputPath)).mode & 0o777).toBe(0o600);
        callback(null, "فهرس الكتاب\nالوحدة الأولى", "");
      })().catch(error => callback(error, "", ""));
    });

    await expect(extractPdfText(pdfBuffer, 12)).resolves.toBe("فهرس الكتاب\nالوحدة الأولى");
    expect(execFileMock).toHaveBeenCalledWith(
      "pdftotext",
      ["-f", "1", "-l", "12", "-enc", "UTF-8", inputPath, "-"],
      { encoding: "utf8", timeout: 60_000, maxBuffer: 2 * 1024 * 1024, shell: false },
      expect.any(Function),
    );
    await expect(access(dirname(inputPath))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("isolates concurrently running requests and preserves each PDF's contents", async () => {
    const pending: Array<{ path: string; callback: Callback }> = [];
    let allStarted!: () => void;
    const started = new Promise<void>(resolve => { allStarted = resolve; });
    execFileMock.mockImplementation((_command, args, _options, callback: Callback) => {
      pending.push({ path: args[6], callback });
      if (pending.length === 2) allStarted();
    });

    const first = extractPdfText(pdfBuffer);
    const secondBuffer = Buffer.from("%PDF-1.7\nsecond request");
    const second = extractPdfText(secondBuffer);
    await started;

    expect(dirname(pending[0].path)).not.toBe(dirname(pending[1].path));
    const inputs = await Promise.all(pending.map(({ path }) => readFile(path)));
    expect(inputs).toEqual(expect.arrayContaining([pdfBuffer, secondBuffer]));
    for (let index = pending.length - 1; index >= 0; index--) {
      pending[index].callback(null, inputs[index].equals(pdfBuffer) ? "الفهرس الأول" : "الفهرس الثاني", "");
    }

    await expect(first).resolves.toBe("الفهرس الأول");
    await expect(second).resolves.toBe("الفهرس الثاني");
    for (const { path } of pending) {
      await expect(access(dirname(path))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it.each([0, -1, 201, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1; touch /tmp/injected"])(
    "rejects invalid page limits before invoking a process: %s",
    async maxPages => {
      await expect(extractPdfText(pdfBuffer, maxPages as number)).rejects.toThrow("من 1 إلى 200");
      expect(execFileMock).not.toHaveBeenCalled();
    },
  );

  it.each([1, 200])("accepts the page limit boundary %s", async maxPages => {
    await expect(extractPdfText(pdfBuffer, maxPages)).resolves.toContain("فهرس");
    expect(execFileMock.mock.calls[0][1][3]).toBe(String(maxPages));
  });

  it.each([Buffer.alloc(0), Buffer.from("not a PDF"), Buffer.from("%PD")])(
    "rejects an invalid PDF header before invoking Poppler",
    async input => {
      await expect(extractPdfText(input)).rejects.toThrow("ليس ملف PDF صالحاً");
      expect(execFileMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a PDF above 50 MiB before creating or processing it", async () => {
    const oversized = Buffer.alloc(50 * 1024 * 1024 + 1);
    oversized.write("%PDF-1.7");
    await expect(extractPdfText(oversized)).rejects.toThrow("50 ميغابايت");
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "ENOENT" }, "غير مثبتة"],
    [{ killed: true }, "وقتاً طويلاً"],
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true }, "كبير جداً"],
    [{ code: 1 }, "غير محمي بكلمة مرور"],
  ])("reports safe errors and cleans up when Poppler fails (%j)", async (properties, message) => {
    execFileMock.mockImplementation((_command, _args, _options, callback: Callback) => {
      callback(Object.assign(new Error("sensitive/path parser detail"), properties), "", "raw detail");
    });

    const outcome = await extractPdfText(pdfBuffer).catch(error => error);
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome.message).toContain(message);
    expect(outcome.message).not.toContain("sensitive");
    expect(outcome.message).not.toContain("raw detail");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const inputPath = execFileMock.mock.calls[0][1][6];
    await expect(access(dirname(inputPath))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("explains that image-only PDFs need OCR and still removes temporary files", async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback: Callback) => {
      callback(null, "\n\f \t", "");
    });

    await expect(extractPdfText(pdfBuffer)).rejects.toThrow("لا تدعم OCR");
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const inputPath = execFileMock.mock.calls[0][1][6];
    await expect(access(dirname(inputPath))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
