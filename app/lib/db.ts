import sql from "mssql";

const config: sql.config = {
  server: process.env.DB_SERVER!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_DATABASE!,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000, // 60 s — queries pesados como fuentes-control necesitan más tiempo
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    pool = await new sql.ConnectionPool(config).connect();
  }
  return pool;
}
