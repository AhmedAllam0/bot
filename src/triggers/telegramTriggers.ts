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

          await handler(mastra, {
            type: triggerType,
            params: {
              chatId: String(message.chat?.id || ""),
              userId: String(from.id || ""),
              userName: from.username || "unknown",
              firstName: from.first_name || "مستخدم",
              message: message.text || payload.callback_query?.data || "",
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
