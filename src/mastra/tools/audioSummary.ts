import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const AUDIO_API_URL = process.env.AUDIO_API_URL;
const AUDIO_API_KEY = process.env.AUDIO_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const getAudioSummary = createTool({
  id: "get-audio-summary",
  description: "يولد ملخص صوتي احترافي للكتاب ويرسله كرسالة صوتية. استخدم هذه الأداة عندما يطلب المستخدم 'ملخص صوتي' أو 'اسمع الكتاب' أو 'صوت' أو 'استمع'.",
  inputSchema: z.object({
    bookTitle: z.string().describe("عنوان الكتاب"),
    summary: z.string().describe("ملخص الكتاب المكتوب (300-500 كلمة)"),
    chatId: z.number().optional().describe("معرف المحادثة لإرسال الصوت"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    audioUrl: z.string().optional(),
    message: z.string(),
    duration: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🎧 [AudioSummary] بدء توليد ملخص صوتي:", context.bookTitle);
    
    if (!AUDIO_API_URL) {
      logger?.warn("⚠️ [AudioSummary] AUDIO_API_URL غير موجود");
      return {
        success: false,
        message: "خاصية الملخصات الصوتية غير مفعلة حالياً. سيتم تفعيلها قريباً!",
      };
    }
    
    try {
      const scriptText = `
أهلاً بكم في ملخص اليوم من خلاصة الكتب.

اليوم نتحدث عن كتاب "${context.bookTitle}".

${context.summary}

شكراً لاستماعكم، ولا تنسوا الاشتراك في قناتنا للمزيد من الملخصات الثقافية.
      `.trim();
      
      logger?.info("📝 [AudioSummary] إرسال النص للتحويل:", scriptText.length, "حرف");
      
      const response = await fetch(`${AUDIO_API_URL}/api/text-to-speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AUDIO_API_KEY}`,
        },
        body: JSON.stringify({
          text: scriptText,
          voice: "alloy",
          language: "ar",
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        logger?.error("❌ [AudioSummary] خطأ من API الصوت:", error);
        return {
          success: false,
          message: "حدث خطأ أثناء توليد الملخص الصوتي. يرجى المحاولة لاحقاً.",
        };
      }
      
      const result = await response.json();
      logger?.info("✅ [AudioSummary] تم توليد الصوت بنجاح:", result);
      
      if (context.chatId && TELEGRAM_BOT_TOKEN && result.audioUrl) {
        await sendVoiceToTelegram(context.chatId, result.audioUrl, context.bookTitle);
      }
      
      return {
        success: true,
        audioUrl: result.audioUrl,
        message: `تم توليد الملخص الصوتي لكتاب "${context.bookTitle}" بنجاح! 🎧`,
        duration: result.duration,
      };
    } catch (error) {
      logger?.error("❌ [AudioSummary] خطأ:", error);
      return {
        success: false,
        message: "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
      };
    }
  },
});

async function sendVoiceToTelegram(chatId: number, audioUrl: string, title: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          voice: audioUrl,
          caption: `🎧 ملخص صوتي: ${title}`,
        }),
      }
    );
    
    return response.ok;
  } catch (error) {
    console.error("❌ [AudioSummary] خطأ في إرسال الصوت لتيليجرام:", error);
    return false;
  }
}

export const checkAudioFeatureStatus = createTool({
  id: "check-audio-feature",
  description: "يتحقق من حالة خاصية الملخصات الصوتية",
  inputSchema: z.object({}),
  outputSchema: z.object({
    enabled: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ mastra }) => {
    const logger = mastra?.getLogger();
    
    if (!AUDIO_API_URL) {
      return {
        enabled: false,
        message: "خاصية الملخصات الصوتية قيد التطوير وستتوفر قريباً! 🎧",
      };
    }
    
    try {
      const response = await fetch(`${AUDIO_API_URL}/api/health`);
      if (response.ok) {
        return {
          enabled: true,
          message: "خاصية الملخصات الصوتية متاحة! أرسل 'ملخص صوتي' متبوعاً باسم الكتاب.",
        };
      }
    } catch (error) {
      logger?.warn("⚠️ [AudioSummary] خدمة الصوت غير متاحة");
    }
    
    return {
      enabled: false,
      message: "خاصية الملخصات الصوتية غير متاحة حالياً.",
    };
  },
});
