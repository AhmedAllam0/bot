import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * أداة التكامل مع Supabase Edge Function API
 * تدير تسجيل المحادثات، جلب السياق، وتتبع المستخدمين
 */

const EDGE_FUNCTION_URL = "https://jrtgesujpinzboszijqn.supabase.co/functions/v1/n8n-handler";

// مخطط السياق المُرجع من Supabase
const ContextMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ContextMessage = z.infer<typeof ContextMessageSchema>;

/**
 * أداة تسجيل المحادثة وجلب السياق
 */
export const logConversationTool = createTool({
  id: "log_conversation",
  
  description: "تسجيل رسالة في قاعدة البيانات وجلب سياق المحادثات السابقة",

  inputSchema: z.object({
    userChatId: z.string().or(z.number()).describe("معرف المستخدم في تيليجرام"),
    message: z.string().describe("رسالة المستخدم الحالية"),
    response: z.string().optional().describe("رد البوت (اختياري)"),
    responseTimeMs: z.number().optional().describe("وقت الاستجابة بالمللي ثانية"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    context: z.array(ContextMessageSchema),
    contextCount: z.number(),
    currentMessage: z.string(),
    recordId: z.string().optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userChatId, message, response, responseTimeMs } = context;

    logger?.info("📝 [logConversation] تسجيل المحادثة:", { userChatId, messageLength: message?.length });

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_conversation",
          user_chat_id: String(userChatId),
          message,
          response: response || null,
          response_time_ms: responseTimeMs || null,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger?.error("❌ [logConversation] خطأ:", { status: res.status, error: errorText });
        return {
          success: false,
          context: [],
          contextCount: 0,
          currentMessage: message,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const data = await res.json();
      logger?.info("✅ [logConversation] تم التسجيل:", { contextCount: data.context_count });

      return {
        success: data.success,
        context: data.context || [],
        contextCount: data.context_count || 0,
        currentMessage: data.current_message || message,
        recordId: data.record_id,
      };
    } catch (error) {
      logger?.error("❌ [logConversation] خطأ غير متوقع:", error);
      return {
        success: false,
        context: [],
        contextCount: 0,
        currentMessage: message,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * أداة جلب السياق فقط (بدون تسجيل)
 */
export const getContextTool = createTool({
  id: "get_context",
  
  description: "جلب سياق المحادثات السابقة للمستخدم بدون تسجيل رسالة جديدة",

  inputSchema: z.object({
    userChatId: z.string().or(z.number()).describe("معرف المستخدم في تيليجرام"),
    limit: z.number().optional().default(10).describe("عدد الرسائل المطلوبة"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    context: z.array(ContextMessageSchema),
    contextCount: z.number(),
    error: z.string().optional(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { userChatId, limit = 10 } = context;

    logger?.info("📖 [getContext] جلب السياق:", { userChatId, limit });

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_context_only",
          user_chat_id: String(userChatId),
          limit,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger?.error("❌ [getContext] خطأ:", { status: res.status, error: errorText });
        return {
          success: false,
          context: [],
          contextCount: 0,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const data = await res.json();
      logger?.info("✅ [getContext] تم الجلب:", { contextCount: data.context?.length || 0 });

      return {
        success: true,
        context: data.context || [],
        contextCount: data.context?.length || 0,
      };
    } catch (error) {
      logger?.error("❌ [getContext] خطأ غير متوقع:", error);
      return {
        success: false,
        context: [],
        contextCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * أداة تتبع المستخدم
 */
export const trackUserTool = createTool({
  id: "track_user",
  
  description: "تسجيل أو تحديث بيانات المستخدم في قاعدة البيانات",

  inputSchema: z.object({
    chatId: z.string().or(z.number()).describe("معرف المستخدم في تيليجرام"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
    lastName: z.string().optional().describe("الاسم الأخير"),
    languageCode: z.string().optional().describe("رمز اللغة"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    userId: z.string().optional(),
    isNewUser: z.boolean().optional(),
    error: z.string().optional(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { chatId, username, firstName, lastName, languageCode } = context;

    logger?.info("👤 [trackUser] تتبع المستخدم:", { chatId, username });

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "track_user",
          chat_id: String(chatId),
          username,
          first_name: firstName,
          last_name: lastName,
          language_code: languageCode,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger?.error("❌ [trackUser] خطأ:", { status: res.status, error: errorText });
        return {
          success: false,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const data = await res.json();
      logger?.info("✅ [trackUser] تم التتبع:", { isNewUser: data.is_new_user });

      return {
        success: data.success,
        userId: data.user_id,
        isNewUser: data.is_new_user,
      };
    } catch (error) {
      logger?.error("❌ [trackUser] خطأ غير متوقع:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * أداة تسجيل الأخطاء
 */
export const logErrorTool = createTool({
  id: "log_error",
  
  description: "تسجيل خطأ في قاعدة البيانات للمراقبة",

  inputSchema: z.object({
    errorType: z.string().describe("نوع الخطأ"),
    errorMessage: z.string().describe("رسالة الخطأ"),
    userChatId: z.string().or(z.number()).optional().describe("معرف المستخدم"),
    additionalData: z.record(z.any()).optional().describe("بيانات إضافية"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { errorType, errorMessage, userChatId, additionalData } = context;

    logger?.info("⚠️ [logError] تسجيل خطأ:", { errorType, userChatId });

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_error",
          error_type: errorType,
          error_message: errorMessage,
          user_chat_id: userChatId ? String(userChatId) : null,
          additional_data: additionalData,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger?.error("❌ [logError] فشل تسجيل الخطأ:", { status: res.status, error: errorText });
        return {
          success: false,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const data = await res.json();
      logger?.info("✅ [logError] تم تسجيل الخطأ");

      return {
        success: data.success,
      };
    } catch (error) {
      logger?.error("❌ [logError] خطأ غير متوقع:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * أداة جلب إعدادات البوت
 */
export const getBotSettingsTool = createTool({
  id: "get_bot_settings",
  
  description: "جلب إعدادات البوت من قاعدة البيانات",

  inputSchema: z.object({}),

  outputSchema: z.object({
    success: z.boolean(),
    settings: z.record(z.any()).optional(),
    error: z.string().optional(),
  }),

  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();

    logger?.info("⚙️ [getBotSettings] جلب الإعدادات");

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get_settings",
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger?.error("❌ [getBotSettings] خطأ:", { status: res.status, error: errorText });
        return {
          success: false,
          error: `HTTP ${res.status}: ${errorText}`,
        };
      }

      const data = await res.json();
      logger?.info("✅ [getBotSettings] تم جلب الإعدادات");

      return {
        success: true,
        settings: data.settings || data,
      };
    } catch (error) {
      logger?.error("❌ [getBotSettings] خطأ غير متوقع:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
