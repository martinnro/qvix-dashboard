import sql from "mssql";

const baseConfig = {
  server: process.env.DB_SERVER!,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_DATABASE!,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool: sql.ConnectionPool | null = null;
let adminPool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    pool = await new sql.ConnectionPool({
      ...baseConfig,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
    }).connect();
  }
  return pool;
}

export async function getAdminPool(): Promise<sql.ConnectionPool> {
  if (!adminPool || !adminPool.connected) {
    adminPool = await new sql.ConnectionPool({
      ...baseConfig,
      user: process.env.DB_ADMIN_USER!,
      password: process.env.DB_ADMIN_PASSWORD!,
    }).connect();
  }
  return adminPool;
}
