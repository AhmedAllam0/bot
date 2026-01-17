import pg from "pg";

export const sharedPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

sharedPool.on("error", (err) => {
  console.error("❌ [Database Pool] خطأ غير متوقع:", err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const result = await sharedPool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ [Database] استعلام بطيء (${duration}ms):`, text.substring(0, 100));
    }
    return result;
  } catch (error) {
    console.error("❌ [Database] خطأ في الاستعلام:", error);
    throw error;
  }
}

export async function getClient() {
  const client = await sharedPool.connect();
  return client;
}

export default sharedPool;
