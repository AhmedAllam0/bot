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

// حد الحروف الأقصى لتيليجرام
const TELEGRAM_MAX_LENGTH = 4096;

/**
 * تقسيم النص الطويل إلى أجزاء بحد 4096 حرف
 * يحاول القص عند نهايات الأسطر أو الفقرات
 */
function splitLongMessage(text: string, maxLength: number = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // البحث عن أفضل نقطة للقص (نهاية سطر أو فقرة)
    let cutPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (cutPoint === -1 || cutPoint < maxLength * 0.5) {
      cutPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (cutPoint === -1 || cutPoint < maxLength * 0.5) {
      cutPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (cutPoint === -1 || cutPoint < maxLength * 0.5) {
      cutPoint = maxLength;
    }
    
    chunks.push(remaining.substring(0, cutPoint).trim());
    remaining = remaining.substring(cutPoint).trim();
  }
  
  return chunks;
}

/**
 * الخطوة 2: إرسال الرد لتيليجرام
 * يتعامل مع الرسائل الطويلة ويسجل أخطاء API
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
    
    logger?.info("📤 [Step 2] إرسال الرد لتيليجرام", { 
      chatId, 
      responseLength: agentResponse.length 
    });

    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!telegramToken) {
      logger?.error("❌ [Step 2] TELEGRAM_BOT_TOKEN غير موجود");
      return { sent: false, chatId };
    }

    // تقسيم الرسالة إذا كانت طويلة
    const messageChunks = splitLongMessage(agentResponse);
    logger?.info(`📝 [Step 2] تقسيم الرسالة إلى ${messageChunks.length} جزء`);

    let allSent = true;
    
    for (let i = 0; i < messageChunks.length; i++) {
      const chunk = messageChunks[i];
      const isLastChunk = i === messageChunks.length - 1;
      
      // إضافة الأزرار فقط للرسالة الأخيرة
      const payload: any = {
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      };
      
      // الرد على الرسالة الأصلية للرسالة الأولى فقط
      if (i === 0 && messageId) {
        payload.reply_to_message_id = messageId;
      }
      
      // إضافة الأزرار للرسالة الأخيرة فقط
      if (isLastChunk) {
        payload.reply_markup = {
          inline_keyboard: [
            [{ text: "🔍 بحث جديد", callback_data: "new_search" }],
            [{ text: "📊 إحصائياتي", callback_data: "my_stats" }, { text: "🏆 المتصدرين", callback_data: "leaderboard" }],
            [{ text: "📤 شارك البوت", switch_inline_query: "جرب بوت خلاصة الكتب! 📚" }],
          ],
        };
      }

      const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // تسجيل تفاصيل الخطأ للتشخيص
        const errorBody = await response.text().catch(() => "Unable to read error body");
        logger?.error("❌ [Step 2] فشل إرسال الرسالة", {
          status: response.status,
          statusText: response.statusText,
          errorBody,
          chunkIndex: i,
          chunkLength: chunk.length,
        });
        allSent = false;
        
        // محاولة إرسال بدون HTML إذا فشل التنسيق
        if (response.status === 400 && errorBody.includes("parse")) {
          logger?.info("🔄 [Step 2] إعادة المحاولة بدون تنسيق HTML");
          const retryPayload = { ...payload, parse_mode: undefined };
          delete retryPayload.parse_mode;
          
          const retryResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(retryPayload),
          });
          
          if (retryResponse.ok) {
            logger?.info("✅ [Step 2] نجحت إعادة المحاولة بدون HTML");
            allSent = true;
          }
        }
      } else {
        logger?.debug(`✅ [Step 2] تم إرسال الجزء ${i + 1}/${messageChunks.length}`);
      }
      
      // تأخير قصير بين الرسائل لتجنب rate limiting
      if (i < messageChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger?.info("✅ [Step 2] تم إرسال الرد بنجاح", { allSent });
    return { sent: allSent, chatId };
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
