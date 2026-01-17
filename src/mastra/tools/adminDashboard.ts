import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool as pool } from "../db/pool";

/**
 * Admin Dashboard Tools
 * 
 * Tools for monitoring and managing the Telegram bot:
 * - Dashboard statistics collection
 * - Message logging
 * - User activity tracking
 * - Recent message retrieval
 */

// ============================================================================
// Tool 1: Log Message - تسجيل الرسائل الواردة
// ============================================================================
export const logMessage = createTool({
  id: "log-message",
  description: "تسجيل كل رسالة واردة إلى قاعدة البيانات لتتبع النشاط والإحصائيات",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    chatId: z.string().describe("معرف المحادثة/الجروب"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
    messageType: z.string().default("text").describe("نوع الرسالة (text, command, etc)"),
    messagePreview: z.string().describe("ملخص الرسالة (أول 200 حرف)"),
    botResponsePreview: z.string().optional().describe("ملخص رد البوت"),
    processingTimeMs: z.number().optional().describe("وقت معالجة الرسالة بالميلي ثانية"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📝 [AdminDashboard] تسجيل رسالة جديدة:", {
      telegramId: context.telegramId,
      chatId: context.chatId,
      messageType: context.messageType,
    });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      logger?.info("📝 [AdminDashboard] إدراج الرسالة في جدول message_logs");
      const result = await pool.query(
        `INSERT INTO message_logs 
         (telegram_id, chat_id, username, first_name, message_type, message_preview, bot_response_preview, processing_time_ms, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [
          context.telegramId,
          context.chatId,
          context.username || null,
          context.firstName || null,
          context.messageType,
          context.messagePreview,
          context.botResponsePreview || null,
          context.processingTimeMs || null,
        ]
      );

      const messageId = result.rows[0]?.id;
      logger?.info("✅ [AdminDashboard] تم تسجيل الرسالة بنجاح", { messageId });

      return {
        success: true,
        messageId,
        message: "تم تسجيل الرسالة بنجاح",
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في تسجيل الرسالة:", error);
      return { success: false, message: "حدث خطأ في تسجيل الرسالة" };
    }
  },
});

// ============================================================================
// Tool 2: Get Recent Messages - الحصول على آخر الرسائل
// ============================================================================
export const getRecentMessages = createTool({
  id: "get-recent-messages",
  description: "الحصول على آخر 50 رسالة من قاعدة البيانات للمراقبة والتحليل",
  inputSchema: z.object({
    limit: z.number().default(50).optional().describe("عدد الرسائل المراد جلبها (افتراضي 50)"),
    messageType: z.string().optional().describe("تصفية حسب نوع الرسالة (اختياري)"),
    telegramId: z.number().optional().describe("تصفية حسب معرف المستخدم (اختياري)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messages: z.array(
      z.object({
        id: z.number(),
        telegramId: z.number(),
        chatId: z.string(),
        username: z.string().nullable(),
        firstName: z.string().nullable(),
        messageType: z.string(),
        messagePreview: z.string(),
        botResponsePreview: z.string().nullable(),
        processingTimeMs: z.number().nullable(),
        createdAt: z.string(),
      })
    ).optional(),
    totalCount: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📬 [AdminDashboard] جلب الرسائل الأخيرة:", {
      limit: context.limit,
      messageType: context.messageType,
      telegramId: context.telegramId,
    });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      let query = "SELECT * FROM message_logs";
      const params: (string | number)[] = [];
      const conditions: string[] = [];

      if (context.messageType) {
        conditions.push(`message_type = $${params.length + 1}`);
        params.push(context.messageType);
      }

      if (context.telegramId) {
        conditions.push(`telegram_id = $${params.length + 1}`);
        params.push(context.telegramId);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
      params.push(context.limit || 50);

      logger?.info("📬 [AdminDashboard] تنفيذ الاستعلام:", { query, params });
      const result = await pool.query(query, params);

      const messages = result.rows.map((row) => ({
        id: row.id,
        telegramId: row.telegram_id,
        chatId: row.chat_id,
        username: row.username,
        firstName: row.first_name,
        messageType: row.message_type,
        messagePreview: row.message_preview,
        botResponsePreview: row.bot_response_preview,
        processingTimeMs: row.processing_time_ms,
        createdAt: row.created_at,
      }));

      logger?.info("✅ [AdminDashboard] تم جلب الرسائل بنجاح", { count: messages.length });

      return {
        success: true,
        messages,
        totalCount: messages.length,
        message: `تم جلب ${messages.length} رسالة بنجاح`,
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في جلب الرسائل:", error);
      return { success: false, message: "حدث خطأ في جلب الرسائل" };
    }
  },
});

// ============================================================================
// Tool 3: Get Users List - الحصول على قائمة المستخدمين
// ============================================================================
export const getUsersList = createTool({
  id: "get-users-list",
  description: "الحصول على قائمة المستخدمين النشطين مع إحصائياتهم الشاملة",
  inputSchema: z.object({
    limit: z.number().default(100).optional().describe("عدد المستخدمين المراد جلبهم"),
    sortBy: z.enum(["totalPoints", "totalReferrals", "dailyStreak", "createdAt"]).default("totalPoints").optional().describe("ترتيب النتائج حسب"),
    minPoints: z.number().default(0).optional().describe("تصفية المستخدمين ذوي النقاط الأقل من هذا الحد"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    users: z.array(
      z.object({
        telegramId: z.number(),
        username: z.string().nullable(),
        firstName: z.string().nullable(),
        totalPoints: z.number(),
        totalReferrals: z.number(),
        dailyStreak: z.number(),
        lastCheckin: z.string().nullable(),
        createdAt: z.string(),
      })
    ).optional(),
    totalCount: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("👥 [AdminDashboard] جلب قائمة المستخدمين:", {
      limit: context.limit,
      sortBy: context.sortBy,
      minPoints: context.minPoints,
    });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      let orderByClause = "total_points DESC";
      switch (context.sortBy) {
        case "totalReferrals":
          orderByClause = "total_referrals DESC";
          break;
        case "dailyStreak":
          orderByClause = "daily_streak DESC";
          break;
        case "createdAt":
          orderByClause = "created_at DESC";
          break;
        default:
          orderByClause = "total_points DESC";
      }

      logger?.info("👥 [AdminDashboard] ترتيب حسب:", orderByClause);

      const result = await pool.query(
        `SELECT 
         telegram_id, username, first_name, total_points, total_referrals, daily_streak, last_checkin, created_at
         FROM competition_users
         WHERE total_points >= $1
         ORDER BY ${orderByClause}
         LIMIT $2`,
        [context.minPoints || 0, context.limit || 100]
      );

      const users = result.rows.map((row) => ({
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        totalPoints: row.total_points,
        totalReferrals: row.total_referrals,
        dailyStreak: row.daily_streak,
        lastCheckin: row.last_checkin,
        createdAt: row.created_at,
      }));

      logger?.info("✅ [AdminDashboard] تم جلب المستخدمين بنجاح", { count: users.length });

      return {
        success: true,
        users,
        totalCount: users.length,
        message: `تم جلب ${users.length} مستخدم بنجاح`,
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في جلب قائمة المستخدمين:", error);
      return { success: false, message: "حدث خطأ في جلب قائمة المستخدمين" };
    }
  },
});

// ============================================================================
// Tool 4: Get Admin Dashboard Stats - الإحصائيات الشاملة
// ============================================================================
export const getAdminDashboardStats = createTool({
  id: "get-admin-dashboard-stats",
  description: "الحصول على إحصائيات شاملة عن استخدام البوت: رسائل اليوم/الأسبوع/الشهر، المستخدمين النشطين، عمليات البحث والتحميل",
  inputSchema: z.object({
    timeRange: z.enum(["today", "week", "month", "all"]).default("today").optional().describe("نطاق الوقت للإحصائيات"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      timeRange: z.string(),
      totalMessages: z.number(),
      uniqueUsers: z.number(),
      bookSearches: z.number(),
      pdfDownloads: z.number(),
      newUsersCount: z.number(),
      activeGroups: z.number(),
      averageProcessingTime: z.number(),
      topUsers: z.array(
        z.object({
          telegramId: z.number(),
          username: z.string().nullable(),
          firstName: z.string().nullable(),
          messageCount: z.number(),
          lastMessageTime: z.string(),
        })
      ),
      messageTypeBreakdown: z.array(
        z.object({
          type: z.string(),
          count: z.number(),
          percentage: z.number(),
        })
      ),
      hourlyDistribution: z.array(
        z.object({
          hour: z.number(),
          messageCount: z.number(),
        })
      ),
      timestamp: z.string(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [AdminDashboard] جلب إحصائيات اللوحة:", { timeRange: context.timeRange });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      // حساب نطاق الوقت
      let dateFilter = "1=1";
      let dateDescription = "كل الوقت";

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      switch (context.timeRange) {
        case "today":
          dateFilter = `DATE(created_at) = '${today.toISOString().split('T')[0]}'`;
          dateDescription = "اليوم";
          break;
        case "week":
          dateFilter = `created_at >= '${weekAgo.toISOString()}'`;
          dateDescription = "الأسبوع الماضي";
          break;
        case "month":
          dateFilter = `created_at >= '${monthAgo.toISOString()}'`;
          dateDescription = "الشهر الماضي";
          break;
        default:
          dateFilter = "1=1";
          dateDescription = "كل الوقت";
      }

      logger?.info("📊 [AdminDashboard] نطاق الوقت:", { dateFilter, dateDescription });

      // 1. إجمالي الرسائل والمستخدمين الفريدين
      logger?.info("📊 [AdminDashboard] جلب الإحصائيات الأساسية");
      const basicStatsResult = await pool.query(
        `SELECT 
         COUNT(*) as total_messages,
         COUNT(DISTINCT telegram_id) as unique_users,
         COUNT(CASE WHEN message_type = 'search' THEN 1 END) as book_searches,
         COUNT(CASE WHEN message_type = 'download' THEN 1 END) as pdf_downloads,
         AVG(CAST(processing_time_ms AS FLOAT)) as avg_processing_time
         FROM message_logs
         WHERE ${dateFilter}`
      );

      const basicStats = basicStatsResult.rows[0];
      logger?.info("✅ [AdminDashboard] تم جلب الإحصائيات الأساسية", basicStats);

      // 2. عدد المستخدمين الجدد
      logger?.info("📊 [AdminDashboard] جلب عدد المستخدمين الجدد");
      const newUsersResult = await pool.query(
        `SELECT COUNT(DISTINCT telegram_id) as new_users_count
         FROM competition_users
         WHERE ${dateFilter.replace('message_logs', 'competition_users').replace('created_at', 'created_at')}`
      );

      const newUsersCount = newUsersResult.rows[0]?.new_users_count || 0;
      logger?.info("✅ [AdminDashboard] عدد المستخدمين الجدد:", newUsersCount);

      // 3. الجروبات النشطة
      logger?.info("📊 [AdminDashboard] جلب الجروبات النشطة");
      const activeGroupsResult = await pool.query(
        `SELECT COUNT(DISTINCT chat_id) as active_groups
         FROM message_logs
         WHERE ${dateFilter}`
      );

      const activeGroups = activeGroupsResult.rows[0]?.active_groups || 0;
      logger?.info("✅ [AdminDashboard] الجروبات النشطة:", activeGroups);

      // 4. أنشط المستخدمين
      logger?.info("📊 [AdminDashboard] جلب أنشط المستخدمين");
      const topUsersResult = await pool.query(
        `SELECT 
         telegram_id, username, first_name,
         COUNT(*) as message_count,
         MAX(created_at) as last_message_time
         FROM message_logs
         WHERE ${dateFilter}
         GROUP BY telegram_id, username, first_name
         ORDER BY message_count DESC
         LIMIT 10`
      );

      const topUsers = topUsersResult.rows.map((row) => ({
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        messageCount: row.message_count,
        lastMessageTime: row.last_message_time,
      }));
      logger?.info("✅ [AdminDashboard] تم جلب أنشط المستخدمين", { count: topUsers.length });

      // 5. توزيع أنواع الرسائل
      logger?.info("📊 [AdminDashboard] جلب توزيع أنواع الرسائل");
      const messageTypesResult = await pool.query(
        `SELECT 
         message_type,
         COUNT(*) as count
         FROM message_logs
         WHERE ${dateFilter}
         GROUP BY message_type
         ORDER BY count DESC`
      );

      const totalMessages = parseInt(basicStats.total_messages || 0);
      const messageTypeBreakdown = messageTypesResult.rows.map((row) => ({
        type: row.message_type,
        count: row.count,
        percentage: totalMessages > 0 ? Math.round((row.count / totalMessages) * 100) : 0,
      }));
      logger?.info("✅ [AdminDashboard] تم جلب توزيع الأنواع", messageTypeBreakdown);

      // 6. توزيع الرسائل بالساعة
      logger?.info("📊 [AdminDashboard] جلب توزيع الرسائل بالساعة");
      const hourlyDistributionResult = await pool.query(
        `SELECT 
         EXTRACT(HOUR FROM created_at)::INTEGER as hour,
         COUNT(*) as message_count
         FROM message_logs
         WHERE ${dateFilter}
         GROUP BY EXTRACT(HOUR FROM created_at)
         ORDER BY hour`
      );

      const hourlyDistribution = hourlyDistributionResult.rows.map((row) => ({
        hour: row.hour,
        messageCount: row.message_count,
      }));
      logger?.info("✅ [AdminDashboard] تم جلب التوزيع بالساعة", { hours: hourlyDistribution.length });

      logger?.info("✅ [AdminDashboard] انتهت عملية جلب الإحصائيات بنجاح");

      return {
        success: true,
        stats: {
          timeRange: dateDescription,
          totalMessages: parseInt(basicStats.total_messages || 0),
          uniqueUsers: parseInt(basicStats.unique_users || 0),
          bookSearches: parseInt(basicStats.book_searches || 0),
          pdfDownloads: parseInt(basicStats.pdf_downloads || 0),
          newUsersCount,
          activeGroups,
          averageProcessingTime: basicStats.avg_processing_time ? Math.round(basicStats.avg_processing_time) : 0,
          topUsers,
          messageTypeBreakdown,
          hourlyDistribution,
          timestamp: new Date().toISOString(),
        },
        message: `تم جلب الإحصائيات بنجاح (${dateDescription})`,
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في جلب الإحصائيات:", error);
      return { success: false, message: "حدث خطأ في جلب الإحصائيات" };
    }
  },
});

// ============================================================================
// Tool 5: Update Daily Stats - تحديث الإحصائيات اليومية
// ============================================================================
export const updateDailyStats = createTool({
  id: "update-daily-stats",
  description: "تحديث الإحصائيات اليومية في جدول admin_stats",
  inputSchema: z.object({
    statDate: z.string().optional().describe("التاريخ بصيغة YYYY-MM-DD (افتراضي اليوم)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      statDate: z.string(),
      totalMessages: z.number(),
      uniqueUsers: z.number(),
      bookSearches: z.number(),
      pdfDownloads: z.number(),
      newUsers: z.number(),
      activeGroups: z.number(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    
    const statDate = context.statDate || new Date().toISOString().split('T')[0];
    logger?.info("📅 [AdminDashboard] تحديث الإحصائيات اليومية:", { statDate });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      // جلب الإحصائيات لهذا التاريخ
      logger?.info("📊 [AdminDashboard] جلب إحصائيات اليوم");
      const dayStatsResult = await pool.query(
        `SELECT 
         COUNT(*) as total_messages,
         COUNT(DISTINCT telegram_id) as unique_users,
         COUNT(CASE WHEN message_type = 'search' THEN 1 END) as book_searches,
         COUNT(CASE WHEN message_type = 'download' THEN 1 END) as pdf_downloads,
         COUNT(DISTINCT chat_id) as active_groups
         FROM message_logs
         WHERE DATE(created_at) = $1`,
        [statDate]
      );

      const dayStats = dayStatsResult.rows[0];

      // جلب عدد المستخدمين الجدد
      const newUsersResult = await pool.query(
        `SELECT COUNT(DISTINCT telegram_id) as new_users
         FROM competition_users
         WHERE DATE(created_at) = $1`,
        [statDate]
      );

      const newUsers = newUsersResult.rows[0]?.new_users || 0;

      logger?.info("📊 [AdminDashboard] حفظ الإحصائيات في قاعدة البيانات");
      
      // حفظ أو تحديث الإحصائيات
      await pool.query(
        `INSERT INTO admin_stats (stat_date, total_messages, unique_users, book_searches, pdf_downloads, new_users, active_groups)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (stat_date)
         DO UPDATE SET 
         total_messages = $2,
         unique_users = $3,
         book_searches = $4,
         pdf_downloads = $5,
         new_users = $6,
         active_groups = $7`,
        [
          statDate,
          parseInt(dayStats.total_messages || 0),
          parseInt(dayStats.unique_users || 0),
          parseInt(dayStats.book_searches || 0),
          parseInt(dayStats.pdf_downloads || 0),
          newUsers,
          parseInt(dayStats.active_groups || 0),
        ]
      );

      logger?.info("✅ [AdminDashboard] تم تحديث الإحصائيات اليومية بنجاح");

      return {
        success: true,
        stats: {
          statDate,
          totalMessages: parseInt(dayStats.total_messages || 0),
          uniqueUsers: parseInt(dayStats.unique_users || 0),
          bookSearches: parseInt(dayStats.book_searches || 0),
          pdfDownloads: parseInt(dayStats.pdf_downloads || 0),
          newUsers,
          activeGroups: parseInt(dayStats.active_groups || 0),
        },
        message: `تم تحديث الإحصائيات اليومية بنجاح (${statDate})`,
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في تحديث الإحصائيات:", error);
      return { success: false, message: "حدث خطأ في تحديث الإحصائيات" };
    }
  },
});

// ============================================================================
// Tool 6: Get Historical Stats - الحصول على الإحصائيات التاريخية
// ============================================================================
export const getHistoricalStats = createTool({
  id: "get-historical-stats",
  description: "الحصول على الإحصائيات التاريخية من جدول admin_stats لعدد محدد من الأيام",
  inputSchema: z.object({
    days: z.number().default(30).optional().describe("عدد الأيام السابقة المراد جلبها (افتراضي 30)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.array(
      z.object({
        statDate: z.string(),
        totalMessages: z.number(),
        uniqueUsers: z.number(),
        bookSearches: z.number(),
        pdfDownloads: z.number(),
        newUsers: z.number(),
        activeGroups: z.number(),
      })
    ).optional(),
    totalCount: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📈 [AdminDashboard] جلب الإحصائيات التاريخية:", { days: context.days });

    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [AdminDashboard] خطأ في إعدادات قاعدة البيانات");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      logger?.info("📈 [AdminDashboard] تنفيذ استعلام الإحصائيات التاريخية");
      const result = await pool.query(
        `SELECT 
         stat_date, total_messages, unique_users, book_searches, pdf_downloads, new_users, active_groups
         FROM admin_stats
         WHERE stat_date >= CURRENT_DATE - INTERVAL '1 day' * $1
         ORDER BY stat_date DESC`,
        [context.days || 30]
      );

      const stats = result.rows.map((row) => ({
        statDate: row.stat_date,
        totalMessages: row.total_messages,
        uniqueUsers: row.unique_users,
        bookSearches: row.book_searches,
        pdfDownloads: row.pdf_downloads,
        newUsers: row.new_users,
        activeGroups: row.active_groups,
      }));

      logger?.info("✅ [AdminDashboard] تم جلب الإحصائيات التاريخية بنجاح", { count: stats.length });

      return {
        success: true,
        stats,
        totalCount: stats.length,
        message: `تم جلب ${stats.length} سجل إحصائيات بنجاح`,
      };
    } catch (error) {
      logger?.error("❌ [AdminDashboard] خطأ في جلب الإحصائيات التاريخية:", error);
      return { success: false, message: "حدث خطأ في جلب الإحصائيات التاريخية" };
    }
  },
});
