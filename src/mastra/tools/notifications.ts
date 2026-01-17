import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool } from "../db/pool";

export const subscribeToNotifications = createTool({
  id: "subscribe_notifications",
  description: "اشتراك المستخدم في إشعارات الكتب الجديدة حسب الفئة أو المؤلف",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم"),
    subscriptionType: z.enum(["author", "category", "keyword"]).describe("نوع الاشتراك"),
    subscriptionValue: z.string().describe("القيمة (اسم المؤلف أو الفئة أو كلمة مفتاحية)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, subscriptionType, subscriptionValue } = context;
    
    logger?.info("🔔 [Notifications] إضافة اشتراك جديد:", { telegramId, subscriptionType, subscriptionValue });
    
    try {
      await sharedPool.query(`
        INSERT INTO user_subscriptions (telegram_id, subscription_type, subscription_value)
        VALUES ($1, $2, $3)
        ON CONFLICT (telegram_id, subscription_type, subscription_value) DO NOTHING
      `, [telegramId, subscriptionType, subscriptionValue]);
      
      logger?.info("✅ [Notifications] تم الاشتراك بنجاح");
      return { 
        success: true, 
        message: `✅ تم اشتراكك في إشعارات ${subscriptionType === 'author' ? 'مؤلف' : subscriptionType === 'category' ? 'فئة' : 'كلمة'}: ${subscriptionValue}` 
      };
    } catch (error: any) {
      logger?.error("❌ [Notifications] خطأ:", error);
      return { success: false, message: "حدث خطأ في الاشتراك" };
    }
  },
});

export const getMySubscriptions = createTool({
  id: "get_my_subscriptions",
  description: "عرض اشتراكات الإشعارات الخاصة بالمستخدم",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    subscriptions: z.array(z.object({
      type: z.string(),
      value: z.string(),
      createdAt: z.string(),
    })),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId } = context;
    
    logger?.info("📋 [Notifications] جلب اشتراكات المستخدم:", { telegramId });
    
    try {
      const result = await sharedPool.query(`
        SELECT subscription_type, subscription_value, created_at
        FROM user_subscriptions
        WHERE telegram_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `, [telegramId]);
      
      const subscriptions = result.rows.map((row: any) => ({
        type: row.subscription_type,
        value: row.subscription_value,
        createdAt: row.created_at,
      }));
      
      logger?.info("✅ [Notifications] تم جلب الاشتراكات:", { count: subscriptions.length });
      return { success: true, subscriptions };
    } catch (error: any) {
      logger?.error("❌ [Notifications] خطأ:", error);
      return { success: false, subscriptions: [] };
    }
  },
});

export const unsubscribeFromNotifications = createTool({
  id: "unsubscribe_notifications",
  description: "إلغاء اشتراك من الإشعارات",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم"),
    subscriptionType: z.enum(["author", "category", "keyword", "all"]).describe("نوع الاشتراك للإلغاء"),
    subscriptionValue: z.string().optional().describe("القيمة المحددة للإلغاء"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    removedCount: z.number(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, subscriptionType, subscriptionValue } = context;
    
    logger?.info("🔕 [Notifications] إلغاء اشتراك:", { telegramId, subscriptionType, subscriptionValue });
    
    try {
      let result;
      if (subscriptionType === "all") {
        result = await sharedPool.query(`
          UPDATE user_subscriptions SET is_active = false
          WHERE telegram_id = $1 AND is_active = true
        `, [telegramId]);
      } else if (subscriptionValue) {
        result = await sharedPool.query(`
          UPDATE user_subscriptions SET is_active = false
          WHERE telegram_id = $1 AND subscription_type = $2 AND subscription_value = $3
        `, [telegramId, subscriptionType, subscriptionValue]);
      } else {
        result = await sharedPool.query(`
          UPDATE user_subscriptions SET is_active = false
          WHERE telegram_id = $1 AND subscription_type = $2
        `, [telegramId, subscriptionType]);
      }
      
      const removedCount = result.rowCount || 0;
      logger?.info("✅ [Notifications] تم إلغاء الاشتراكات:", { removedCount });
      return { 
        success: true, 
        message: removedCount > 0 ? `✅ تم إلغاء ${removedCount} اشتراك` : "⚠️ لم يتم العثور على اشتراكات للإلغاء",
        removedCount,
      };
    } catch (error: any) {
      logger?.error("❌ [Notifications] خطأ:", error);
      return { success: false, message: "حدث خطأ", removedCount: 0 };
    }
  },
});
