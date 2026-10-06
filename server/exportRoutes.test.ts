import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  plan: vi.fn(),
  worksheet: vi.fn(),
  docx: vi.fn(),
  pdf: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./rateLimiter", () => ({
  checkRateLimit: mocks.limit,
  RATE_LIMITS: {
    exportPdf: { action: "exportPdf" },
    exportDocx: { action: "exportDocx" },
  },
}));
vi.mock("./_core/context", () => ({ authenticateUser: mocks.auth }));
vi.mock("./db", () => ({
  getPlanById: mocks.plan,
  getWorksheetById: mocks.worksheet,
  getLessonById: vi.fn(async () => ({ unitId: 10 })),
  getUnitById: vi.fn(async () => ({ textbookId: 20 })),
  getTextbookById: vi.fn(async () => ({ countryId: 9 })),
}));
vi.mock("./exportDoc", () => ({
  generateDocx: mocks.docx,
  generateWorksheetDocx: mocks.docx,
  generatePdfFromDocx: mocks.pdf,
}));
vi.mock("../shared/generation", () => ({
  planContentSchema: { parse: (value: unknown) => value },
  worksheetContentSchema: { parse: (value: unknown) => value },
}));
vi.mock("./documentHtml", () => ({
  generatePlanHtml: () => "<!doctype html><p>خطة</p>",
  generateWorksheetHtml: () => "<!doctype html><p>ورقة عمل</p>",
}));
import { registerExportRoutes } from "./exportRoutes";

let server: Server;
let base: string;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.limit.mockReset();
  mocks.auth.mockResolvedValue({ id: 7 });
  mocks.plan.mockResolvedValue({
    id: 42,
    lessonId: 3,
    templateId: 5,
    status: "ready",
    content: {},
  });
  mocks.worksheet.mockResolvedValue({ id: 44, content: {} });
  mocks.docx.mockResolvedValue(Buffer.from("docx bytes"));
  mocks.pdf.mockResolvedValue(Buffer.from("%PDF-1.4"));
  const app = express();
  registerExportRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/exports`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe("Owned authenticated export downloads", () => {
  it("rejects guests before reading content", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await fetch(`${base}/plans/42.docx`)).status).toBe(401);
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("resolves plan ownership and the stored template and returns attachment bytes", async () => {
    const response = await fetch(`${base}/plans/42.docx`);
    expect(response.status).toBe(200);
    expect(mocks.plan).toHaveBeenCalledWith(42, 7);
    expect(mocks.docx).toHaveBeenCalledWith({}, 9, 5);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(await response.text()).toBe("docx bytes");
  });
  it("returns 404 without rendering another teacher's plan", async () => {
    mocks.plan.mockResolvedValue(undefined);
    expect((await fetch(`${base}/plans/42.docx`)).status).toBe(404);
    expect(mocks.docx).not.toHaveBeenCalled();
  });
  it("checks worksheet owner and returns actual PDF bytes", async () => {
    const response = await fetch(`${base}/worksheets/44.pdf`);
    expect(mocks.worksheet).toHaveBeenCalledWith(44, 7);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(await response.text()).toBe("%PDF-1.4");
  });
  it("returns printable HTML with restrictive CSP when conversion is unavailable", async () => {
    mocks.pdf.mockRejectedValue(new Error("no LibreOffice"));
    const response = await fetch(`${base}/plans/42.pdf`);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'"
    );
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await response.text()).toContain("خطة");
  });
  it("rejects path and format misuse", async () => {
    for (const endpoint of ["plans/-1.docx", "plans/1.exe", "invalid/1.pdf"])
      expect((await fetch(`${base}/${endpoint}`)).status).toBe(404);
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("enforces export rate limits before fetching or rendering owned content", async () => {
    mocks.limit.mockImplementation(() => {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "طلبات كثيرة",
      });
    });
    expect((await fetch(`${base}/plans/42.pdf`)).status).toBe(429);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
});
