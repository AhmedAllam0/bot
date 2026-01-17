/**
 * Telegram Trigger - Webhook-based Workflow Triggering
 *
 * This module provides Telegram bot event handling for Mastra workflows.
 * When Telegram messages are received, this trigger starts your workflow.
 *
 * PATTERN:
 * 1. Import registerTelegramTrigger and your workflow
 * 2. Call registerTelegramTrigger with a triggerType and handler
 * 3. Spread the result into the apiRoutes array in src/mastra/index.ts
 *
 * USAGE in src/mastra/index.ts:
 *
 * ```typescript
 * import { registerTelegramTrigger } from "../triggers/telegramTriggers";
 * import { telegramBotWorkflow } from "./workflows/telegramBotWorkflow";
 * import { inngest } from "./inngest";
 *
 * // In the apiRoutes array:
 * ...registerTelegramTrigger({
 *   triggerType: "telegram/message",
 *   handler: async (mastra, triggerInfo) => {
 *     const run = await telegramBotWorkflow.createRunAsync();
 *     return await inngest.send({
 *       name: `workflow.${telegramBotWorkflow.id}`,
 *       data: {
 *         runId: run?.runId,
 *         inputData: {},
 *       },
 *     });
 *   }
 * })
 * ```
 */

import type { ContentfulStatusCode } from "hono/utils/http-status";

import { registerApiRoute } from "../mastra/inngest";
import { Mastra } from "@mastra/core";
import { checkRateLimit, getRateLimitMessage } from "../mastra/utils/rateLimiter";

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn(
    "Trying to initialize Telegram triggers without TELEGRAM_BOT_TOKEN. Can you confirm that the Telegram integration is configured correctly?",
  );
}

const ADMIN_USER_IDS = [
  "1002139582646",
  "1002129652576",
];

const ADMIN_GROUP_IDS = [
  "-1002139582646",
  "-1002129652576",
];

export type TriggerInfoTelegramOnNewMessage = {
  type: "telegram/message";
  params: {
    chatId: string;
    userId: string;
    userName: string;
    firstName: string;
    message: string;
    messageId: number;
  };
  payload: any;
};

export function registerTelegramTrigger({
  triggerType,
  handler,
}: {
  triggerType: string;
  handler: (
    mastra: Mastra,
    triggerInfo: TriggerInfoTelegramOnNewMessage,
  ) => Promise<void>;
}) {
  return [
    registerApiRoute("/webhooks/telegram/action", {
      method: "POST",
      handler: async (c) => {
        const mastra = c.get("mastra");
        const logger = mastra.getLogger();
        try {
          const payload = await c.req.json();

          logger?.info("📝 [Telegram] payload", payload);

          // تجاهل الرسائل المُعدَّلة
          if (payload.edited_message) {
            logger?.debug("⏭️ [Telegram] تجاهل رسالة معدّلة");
            return c.text("OK", 200);
          }

          // الترحيب بالأعضاء الجدد ثم حذف الرسالة
          if (payload.message?.new_chat_members && payload.message.new_chat_members.length > 0) {
            const chatId = String(payload.message.chat?.id || "");
            const newMembers = payload.message.new_chat_members;
            
            logger?.info("👋 [Telegram] أعضاء جدد انضموا:", { chatId, count: newMembers.length });
            
            // دالة لتنظيف النص من أحرف HTML الخاصة
            const escapeHtml = (text: string): string => {
              return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
            };
            
            for (const member of newMembers) {
              // تجاهل البوتات
              if (member.is_bot) continue;
              
              const firstName = escapeHtml(member.first_name || "صديق");
              const welcomeMessage = `🎉 أهلاً وسهلاً <b>${firstName}</b>!\n\n📚 مرحباً بك في <b>خلاصة الكتب</b>\n\n✨ اكتب اسم أي كتاب وسأجد لك رابط تحميله أو أرسله لك مباشرة!\n\n💡 جرب: "كتاب الأمير" أو "رواية الفيل الأزرق"`;
              
              try {
                const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: welcomeMessage,
                    parse_mode: "HTML",
                  }),
                });
                
                if (response.ok) {
                  const result = await response.json();
                  const welcomeMessageId = result.result?.message_id;
                  
                  logger?.info("✅ [Telegram] تم إرسال رسالة الترحيب:", { chatId, messageId: welcomeMessageId });
                  
                  // حذف الرسالة بعد 30 ثانية
                  if (welcomeMessageId) {
                    setTimeout(async () => {
                      try {
                        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/deleteMessage`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            chat_id: chatId,
                            message_id: welcomeMessageId,
                          }),
                        });
                        logger?.debug("🗑️ [Telegram] تم حذف رسالة الترحيب");
                      } catch (deleteErr) {
                        logger?.debug("⚠️ [Telegram] فشل حذف رسالة الترحيب:", deleteErr);
                      }
                    }, 30000); // 30 ثانية
                  }
                } else {
                  const errorBody = await response.text().catch(() => "Unable to read error");
                  logger?.error("❌ [Telegram] فشل إرسال رسالة الترحيب:", {
                    status: response.status,
                    statusText: response.statusText,
                    errorBody,
                  });
                }
              } catch (err) {
                logger?.warn("⚠️ [Telegram] فشل إرسال رسالة الترحيب:", err);
              }
            }
            
            return c.text("OK", 200);
          }

          // استخراج البيانات من رسالة تيليجرام
          const message = payload.message || payload.callback_query?.message;
          const from = payload.message?.from || payload.callback_query?.from;
          
          if (!message || !from) {
            logger?.warn("⚠️ [Telegram] رسالة غير صالحة", payload);
            return c.text("OK", 200);
          }

          // تجاهل الرسائل المُحوَّلة تلقائياً من القناة
          if (message.is_automatic_forward || message.forward_from_chat) {
            logger?.debug("⏭️ [Telegram] تجاهل رسالة محوّلة من القناة");
            return c.text("OK", 200);
          }

          // تجاهل الرسائل من البوتات أو من Telegram (userId: 777000)
          if (from.is_bot || from.id === 777000) {
            logger?.debug("⏭️ [Telegram] تجاهل رسالة من بوت");
            return c.text("OK", 200);
          }

          // تجاهل رسائل المشرفين والمالكين
          const userId = String(from.id);
          if (ADMIN_USER_IDS.includes(userId)) {
            logger?.debug("⏭️ [Telegram] تجاهل رسالة من مشرف:", userId);
            return c.text("OK", 200);
          }

          // تجاهل الرسائل من جروبات المشرفين
          const chatId = String(message.chat?.id || "");
          if (ADMIN_GROUP_IDS.includes(chatId)) {
            logger?.debug("⏭️ [Telegram] تجاهل رسالة من جروب إداري:", chatId);
            return c.text("OK", 200);
          }

          // فحص Rate Limiting لمنع السبام
          const rateCheck = checkRateLimit(userId, "message");
          if (!rateCheck.allowed) {
            logger?.warn("⚠️ [Telegram] تجاوز حد الرسائل:", { userId, resetIn: rateCheck.resetIn });
            
            // إرسال رسالة تحذير للمستخدم
            try {
              await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: getRateLimitMessage(rateCheck.resetIn),
                }),
              });
            } catch (e) {
              logger?.debug("⚠️ [Telegram] فشل إرسال رسالة تحذير Rate Limit");
            }
            
            return c.text("OK", 200);
          }

          // للـ callback_query: استخدم callback_data كرسالة
          // للرسائل العادية: استخدم نص الرسالة
          const messageText = payload.callback_query?.data || message.text || "";
          const isCallback = !!payload.callback_query;
          
          logger?.info("📨 [Telegram Trigger] رسالة جديدة:", {
            chatId: String(message.chat?.id || ""),
            userId: String(from.id || ""),
            message: messageText.substring(0, 50),
            isCallback,
          });

          // الرد على callback_query لإزالة spinner من الزر
          if (isCallback && payload.callback_query?.id) {
            try {
              await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  callback_query_id: payload.callback_query.id,
                }),
              });
              logger?.debug("✅ [Telegram] تم الرد على callback_query");
            } catch (err) {
              logger?.warn("⚠️ [Telegram] فشل الرد على callback_query:", err);
            }
          }

          await handler(mastra, {
            type: triggerType,
            params: {
              chatId: String(message.chat?.id || ""),
              userId: String(from.id || ""),
              userName: from.username || "unknown",
              firstName: from.first_name || "مستخدم",
              message: messageText,
              messageId: message.message_id || 0,
            },
            payload,
          } as TriggerInfoTelegramOnNewMessage);

          return c.text("OK", 200);
        } catch (error) {
          logger?.error("Error handling Telegram webhook:", error);
          return c.text("Internal Server Error", 500);
        }
      },
    }),
  ];
}
