// This helper can migrate ONLY a disposable loopback database. It deliberately
// ignores DATABASE_URL and must never receive application/production credentials.
const connectionString = process.env.AUTH_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("AUTH_TEST_DATABASE_URL is required for disposable migration checks");
}

let target;
try {
  target = new URL(connectionString);
} catch {
  throw new Error("Invalid AUTH_TEST_DATABASE_URL; no database connection attempted");
}

if (
  target.protocol !== "mysql:" ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.pathname !== "/teachassist_test" ||
  target.search !== "" ||
  target.hash !== ""
) {
  throw new Error(
    "Migration checks require mysql://...@localhost or 127.0.0.1/teachassist_test without URL options; no connection attempted",
  );
}

const [{ createConnection }, { drizzle }, { migrate }] = await Promise.all([
  import("mysql2/promise"),
  import("drizzle-orm/mysql2"),
  import("drizzle-orm/mysql2/migrator"),
]);
const connection = await createConnection(connectionString);
try {
  const db = drizzle(connection);
  const migrationsFolder = new URL("../drizzle/", import.meta.url).pathname;
  await migrate(db, { migrationsFolder });
  // A second pass checks that journal tracking makes replay a no-op.
  await migrate(db, { migrationsFolder });
  console.info("Tracked migrations applied and replayed on disposable teachassist_test");
} finally {
  await connection.end();
}
