import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mock = vi.hoisted(() => {
  const query = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
  const update = { set: vi.fn(), where: vi.fn() };
  return { query, update, database: { select: vi.fn(), update: vi.fn() }, drizzle: vi.fn() };
});
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mock.drizzle }));
import { getCachedPlan, getCachedWorksheet, getGenerationLessonContext, getWorksheetById, reserveGenerationCredit, refundGenerationCredit } from "./db";

const dialect = new MySqlDialect();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost/unused");
  mock.drizzle.mockReturnValue(mock.database);
  mock.database.select.mockReturnValue(mock.query);
  mock.query.from.mockReturnValue(mock.query);
  mock.query.innerJoin.mockReturnValue(mock.query);
  mock.query.where.mockReturnValue(mock.query);
  mock.query.orderBy.mockReturnValue(mock.query);
  mock.query.limit.mockResolvedValue([]);
  mock.database.update.mockReturnValue(mock.update);
  mock.update.set.mockReturnValue(mock.update);
  mock.update.where.mockResolvedValue([{ affectedRows: 1 }]);
});

describe("Generation database privacy and accounting SQL", () => {
  it("binds teacher, lesson, template, exact date, periods and ready status in the cache query", async () => {
    await getCachedPlan(7, 14, 8, "2026-10-07", 2);
    const query = dialect.sqlToQuery(mock.query.where.mock.calls[0][0]);
    expect(query.sql).toContain("`plans`.`userId` = ?");
    expect(query.sql).toContain("`plans`.`planDate` = ?");
    expect(query.sql).toContain("`plans`.`periods` = ?");
    expect(query.params).toEqual([7, 14, 8, new Date("2026-10-07T00:00:00Z"), 2, "ready"]);
  });

  it("only loads a worksheet that belongs to the current teacher", async () => {
    await getWorksheetById(33, 7);
    const query = dialect.sqlToQuery(mock.query.where.mock.calls[0][0]);
    expect(query.params).toEqual([33, 7]);
    expect(query.sql).toContain("`worksheets`.`userId` = ?");
  });

  it("isolates cached worksheets by the owner as well as the plan", async () => {
    await getCachedWorksheet(21, 7);
    const query = dialect.sqlToQuery(mock.query.where.mock.calls[0][0]);
    expect(query.params).toEqual([21, 7]);
    expect(query.sql).toContain("`worksheets`.`userId` = ?");
  });

  it("joins the entire curriculum chain and excludes drafts and inactive countries", async () => {
    expect(await getGenerationLessonContext(14)).toBeUndefined();
    expect(mock.query.innerJoin).toHaveBeenCalledTimes(6);
    const query = dialect.sqlToQuery(mock.query.where.mock.calls[0][0]);
    expect(query.params).toEqual([14, "approved", "approved", "approved", true]);
    const joins = mock.query.innerJoin.mock.calls.map(([, condition]) => dialect.sqlToQuery(condition).sql).join(" ");
    expect(joins).toContain("`subjects`.`countryId` = `countries`.`id`");
    expect(joins).toContain("`stages`.`countryId` = `countries`.`id`");
  });

  it("reserves with a conditional decrement rather than reading and overwriting the balance", async () => {
    expect(await reserveGenerationCredit(7)).toBe(true);
    expect(mock.database.select).not.toHaveBeenCalled();
    const predicate = dialect.sqlToQuery(mock.update.where.mock.calls[0][0]);
    const decrement = dialect.sqlToQuery(mock.update.set.mock.calls[0][0].balance);
    expect(predicate.sql).toContain("`plan_credits`.`balance` > 0");
    expect(predicate.params).toEqual([7]);
    expect(decrement.sql).toBe("`plan_credits`.`balance` - 1");
  });

  it("denies generation when the conditional decrement affects no row", async () => {
    mock.update.where.mockResolvedValue([{ affectedRows: 0 }]);
    expect(await reserveGenerationCredit(7)).toBe(false);
  });

  it("refunds using atomic SQL increment and verifies the reserved account exists", async () => {
    await refundGenerationCredit(7);
    const increment = dialect.sqlToQuery(mock.update.set.mock.calls[0][0].balance);
    expect(increment.sql).toBe("`plan_credits`.`balance` + 1");
    mock.update.where.mockResolvedValue([{ affectedRows: 0 }]);
    await expect(refundGenerationCredit(7)).rejects.toThrow("could not be refunded");
  });
});
