import { createStep, createWorkflow } from "../inngest";
import { z } from "zod";
import { bookSearchAgent } from "../agents/bookSearchAgent";

/**
 * Workflow للبحث عن الكتب عبر تيليجرام
 * يتكون من خطوتين فقط:
 * 1. معالجة الرسالة بواسطة الوكيل (generate)
 * 2. إرسال الرد لتيليجرام
 */

// مخطط الإدخال للـ Workflow
const WorkflowInputSchema = z.object({
  chatId: z.string().describe("معرف المحادثة في تيليجرام"),
  userId: z.string().describe("معرف المستخدم"),
  userName: z.string().describe("اسم المستخدم"),
  message: z.string().describe("رسالة المستخدم"),
  messageId: z.number().optional().describe("معرف الرسالة"),
});

/**
 * الخطوة 1: معالجة الرسالة بواسطة الوكيل
 * استدعاء generate للتوافق مع V2/V3 models
 */
const processWithAgent = createStep({
  id: "process-with-agent",
  description: "معالجة رسالة المستخدم باستخدام وكيل البحث عن الكتب",

  inputSchema: WorkflowInputSchema,

  outputSchema: z.object({
    chatId: z.string(),
    messageId: z.number().optional(),
    agentResponse: z.string(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { chatId, userId, message, messageId } = inputData;
    
    logger?.info("🚀 [Step 1] بدء معالجة الرسالة بواسطة الوكيل", { chatId, userId });

    // تضمين chatId و userId في الرسالة ليستخدمها الوكيل مع الأدوات
    const messageWithContext = `[chatId:${chatId}][userId:${userId}] ${message}`;
    
    // استخدام resourceId و threadId لتفعيل نظام الذاكرة
    // resourceId = userId للذاكرة العاملة المشتركة بين المحادثات
    // threadId = chatId لذاكرة المحادثة الحالية
    // استخدام generateLegacy للتوافق مع Mastra Playground
    const response = await bookSearchAgent.generateLegacy(
      [{ role: "user", content: messageWithContext }],
      { 
        maxSteps: 5,
        resourceId: `telegram-user-${userId}`,
        threadId: `telegram-chat-${chatId}`,
      },
    );

    logger?.info("✅ [Step 1] رد الوكيل جاهز");

    return {
      chatId,
      messageId,
      agentResponse: response.text || "⚠️ عذراً، لم أتمكن من معالجة طلبك.",
    };
  },
});

/**
 * الخطوة 2: إرسال الرد لتيليجرام
 * فقط إرسال الرسالة - لا منطق إضافي
 */
const sendToTelegram = createStep({
  id: "send-to-telegram",
  description: "إرسال رد الوكيل إلى تيليجرام",

  inputSchema: z.object({
    chatId: z.string(),
    messageId: z.number().optional(),
    agentResponse: z.string(),
  }),

  outputSchema: z.object({
    sent: z.boolean(),
    chatId: z.string(),
  }),

  execute: async ({ inputData, mastra }) => {
    const logger = mastra?.getLogger();
    const { chatId, messageId, agentResponse } = inputData;
    
    logger?.info("📤 [Step 2] إرسال الرد لتيليجرام");

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!telegramToken) {
      logger?.error("❌ [Step 2] TELEGRAM_BOT_TOKEN غير موجود");
      return { sent: false, chatId };
    }

    // إرسال بتنسيق HTML للحصول على تنسيق أفضل
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: agentResponse,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_to_message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔍 بحث جديد", callback_data: "new_search" }],
            [{ text: "📊 إحصائياتي", callback_data: "my_stats" }, { text: "🏆 المتصدرين", callback_data: "leaderboard" }],
            [{ text: "📤 شارك البوت", switch_inline_query: "جرب بوت خلاصة الكتب! 📚" }],
          ],
        },
      }),
    });

    if (!response.ok) {
      logger?.error("❌ [Step 2] فشل إرسال الرسالة");
      return { sent: false, chatId };
    }

    logger?.info("✅ [Step 2] تم إرسال الرد بنجاح");
    return { sent: true, chatId };
  },
});

/**
 * إنشاء الـ Workflow
 */
export const bookSearchWorkflow = createWorkflow({
  id: "book-search-workflow",
  inputSchema: WorkflowInputSchema as any,
  outputSchema: z.object({
    sent: z.boolean(),
    chatId: z.string(),
  }),
})
  .then(processWithAgent as any)
  .then(sendToTelegram as any)
  .commit();
