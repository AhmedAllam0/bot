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

// Initialize database schema and constraints on startup
async function initializeDatabase() {
  const client = await sharedPool.connect();
  try {
    console.log("🔄 [Database] بدء تهيئة قاعدة البيانات...");
    
    // Create migration tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ [Database] جدول الهجرات جاهز");

    // Define migration for UNIQUE constraint on daily_activity
    const migrationName = "001_add_unique_constraint_daily_activity";
    
    // Check if migration already executed
    const result = await client.query(
      "SELECT * FROM migrations WHERE name = $1",
      [migrationName]
    );

    if (result.rows.length === 0) {
      try {
        // Add UNIQUE constraint to daily_activity table if it doesn't exist
        console.log(`⚙️ [Database] تنفيذ الهجرة: ${migrationName}`);
        
        await client.query(`
          ALTER TABLE daily_activity
          ADD CONSTRAINT unique_user_daily_activity UNIQUE (telegram_id, activity_date)
        `);
        
        // Record migration as executed
        await client.query(
          "INSERT INTO migrations (name) VALUES ($1)",
          [migrationName]
        );
        
        console.log(`✅ [Database] تم تنفيذ الهجرة بنجاح: ${migrationName}`);
      } catch (error: any) {
        // Check if error is because constraint already exists (this is acceptable)
        if (error.message && error.message.includes("already exists")) {
          console.log(`⏭️ [Database] القيد موجود بالفعل: ${migrationName}`);
          // Record as executed anyway
          await client.query(
            "INSERT INTO migrations (name) VALUES ($1)",
            [migrationName]
          );
        } else if (error.message && error.message.includes("relation") && error.message.includes("does not exist")) {
          console.log(`⏭️ [Database] جدول daily_activity غير موجود بعد، سيتم إنشاؤه لاحقاً: ${migrationName}`);
          // Record as executed anyway to avoid trying again
          try {
            await client.query(
              "INSERT INTO migrations (name) VALUES ($1)",
              [migrationName]
            );
          } catch (ignoreError) {
            // Ignore duplicate key error
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log(`⏭️ [Database] تم تنفيذ الهجرة بالفعل: ${migrationName}`);
    }

    console.log("✅ [Database] انتهت تهيئة قاعدة البيانات");
  } catch (error) {
    console.error("❌ [Database] خطأ في تهيئة قاعدة البيانات:", error);
    // Don't throw - allow app to continue as migrations are not critical
  } finally {
    client.release();
  }
}

// Migration to create core tables
async function createCoreTablesIfNotExist(client: pg.PoolClient) {
  const migrationName = "002_create_core_tables";
  
  const result = await client.query(
    "SELECT * FROM migrations WHERE name = $1",
    [migrationName]
  );

  if (result.rows.length > 0) {
    console.log(`⏭️ [Database] تم تنفيذ الهجرة بالفعل: ${migrationName}`);
    return;
  }

  console.log(`⚙️ [Database] تنفيذ الهجرة: ${migrationName}`);

  // Create competition_users table
  await client.query(`
    CREATE TABLE IF NOT EXISTS competition_users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255),
      total_points INTEGER DEFAULT 0,
      title_id INTEGER DEFAULT 1,
      referral_code VARCHAR(20) UNIQUE,
      total_referrals INTEGER DEFAULT 0,
      daily_streak INTEGER DEFAULT 0,
      last_checkin DATE,
      rewards_claimed TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create daily_activity table
  await client.query(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES competition_users(id),
      telegram_id BIGINT NOT NULL,
      activity_date DATE NOT NULL,
      group_messages INTEGER DEFAULT 0,
      group_points_earned INTEGER DEFAULT 0,
      daily_checkin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (telegram_id, activity_date)
    )
  `);

  // Create referrals table
  await client.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_telegram_id BIGINT NOT NULL,
      referee_telegram_id BIGINT UNIQUE NOT NULL,
      referral_code VARCHAR(20),
      points_awarded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create message_logs table for admin dashboard
  await client.query(`
    CREATE TABLE IF NOT EXISTS message_logs (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      chat_id BIGINT NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255),
      message_type VARCHAR(50) DEFAULT 'text',
      message_preview TEXT,
      bot_response_preview TEXT,
      processing_time_ms INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create admin_stats table
  await client.query(`
    CREATE TABLE IF NOT EXISTS admin_stats (
      id SERIAL PRIMARY KEY,
      stat_date DATE UNIQUE NOT NULL,
      total_messages INTEGER DEFAULT 0,
      unique_users INTEGER DEFAULT 0,
      book_searches INTEGER DEFAULT 0,
      pdf_downloads INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      active_groups INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for better performance
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON message_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_logs_telegram_id ON message_logs(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(activity_date);
    CREATE INDEX IF NOT EXISTS idx_competition_users_telegram_id ON competition_users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_admin_stats_date ON admin_stats(stat_date DESC);
  `);

  // Record migration
  await client.query(
    "INSERT INTO migrations (name) VALUES ($1)",
    [migrationName]
  );
  
  console.log(`✅ [Database] تم إنشاء الجداول الأساسية بنجاح`);
}

// Migration to create book_cache table
async function createBookCacheTable(client: pg.PoolClient) {
  const migrationName = "003_create_book_cache_table";
  
  const result = await client.query(
    "SELECT * FROM migrations WHERE name = $1",
    [migrationName]
  );

  if (result.rows.length > 0) {
    console.log(`⏭️ [Database] تم تنفيذ الهجرة بالفعل: ${migrationName}`);
    return;
  }

  console.log(`⚙️ [Database] تنفيذ الهجرة: ${migrationName}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS book_cache (
      id SERIAL PRIMARY KEY,
      book_name_normalized VARCHAR(500) UNIQUE NOT NULL,
      book_name_original VARCHAR(500) NOT NULL,
      pdf_url TEXT,
      download_links JSONB,
      summary TEXT,
      author VARCHAR(255),
      category VARCHAR(100),
      search_count INTEGER DEFAULT 1,
      last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_book_cache_name ON book_cache(book_name_normalized);
    CREATE INDEX IF NOT EXISTS idx_book_cache_search_count ON book_cache(search_count DESC);
  `);

  await client.query(
    "INSERT INTO migrations (name) VALUES ($1)",
    [migrationName]
  );
  
  console.log(`✅ [Database] تم إنشاء جدول book_cache بنجاح`);
}

// Migration to create user_subscriptions table
async function createUserSubscriptionsTable(client: pg.PoolClient) {
  const migrationName = "004_create_user_subscriptions_table";
  
  const result = await client.query(
    "SELECT * FROM migrations WHERE name = $1",
    [migrationName]
  );

  if (result.rows.length > 0) {
    console.log(`⏭️ [Database] تم تنفيذ الهجرة بالفعل: ${migrationName}`);
    return;
  }

  console.log(`⚙️ [Database] تنفيذ الهجرة: ${migrationName}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      subscription_type VARCHAR(50) NOT NULL,
      subscription_value VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (telegram_id, subscription_type, subscription_value)
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_telegram_id ON user_subscriptions(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active ON user_subscriptions(is_active) WHERE is_active = true;
  `);

  await client.query(
    "INSERT INTO migrations (name) VALUES ($1)",
    [migrationName]
  );
  
  console.log(`✅ [Database] تم إنشاء جدول user_subscriptions بنجاح`);
}

// Initialize database when pool is created
(async () => {
  try {
    await initializeDatabase();
    const client = await sharedPool.connect();
    try {
      await createCoreTablesIfNotExist(client);
      await createBookCacheTable(client);
      await createUserSubscriptionsTable(client);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("❌ [Database] فشل تهيئة قاعدة البيانات، قد تكون بعض الميزات غير متاحة:", err);
  }
})();

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
