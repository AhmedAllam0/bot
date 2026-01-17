import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/search";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const TRUSTED_PDF_DOMAINS = [
  "kutub-pdf.net",
  "foulabook.com",
  "books-library.net",
  "noor-book.com",
  "hindawi.org",
  "archive.org",
  "ia800",
  "ia600",
];

const SEARCH_ANIMATIONS = [
  { emoji: "🔮", text: "أستحضر الكتاب من عالم المعرفة...", subtext: "✨ السحر يبدأ" },
  { emoji: "🔍", text: "أبحث في أعماق المكتبات الرقمية...", subtext: "📚 آلاف الكتب أمامي" },
  { emoji: "🌐", text: "أتصفح خزائن الكتب حول العالم...", subtext: "🗺️ من الشرق للغرب" },
  { emoji: "📡", text: "أستقبل إشارات من المكتبات...", subtext: "📶 تم الاتصال" },
  { emoji: "📖", text: "وجدت أثراً للكتاب!", subtext: "🎯 أقترب منه" },
  { emoji: "✨", text: "أتحقق من جودة الملف...", subtext: "🔎 فحص دقيق" },
  { emoji: "📦", text: "أحضّر الكتاب للإرسال...", subtext: "🎁 تغليف أنيق" },
  { emoji: "🚀", text: "إطلاق الكتاب إليك!", subtext: "💫 في الطريق" },
];

const BOOK_LOADING_FRAMES = [
  "📖", "📗", "📘", "📙", "📕", "📓", "📔", "📒"
];

const PROGRESS_BAR_STYLES = {
  empty: "░",
  filled: "█",
  head: "▓",
};

function generateProgressBar(step: number, total: number = 10): string {
  const filled = Math.floor((step / total) * 10);
  const remaining = 10 - filled;
  
  if (filled === 0) return PROGRESS_BAR_STYLES.empty.repeat(10);
  if (filled >= 10) return PROGRESS_BAR_STYLES.filled.repeat(10);
  
  return PROGRESS_BAR_STYLES.filled.repeat(filled - 1) + 
         PROGRESS_BAR_STYLES.head + 
         PROGRESS_BAR_STYLES.empty.repeat(remaining);
}

const LOADING_TIPS = [
  "💡 هل تعلم؟ القراءة تقلل التوتر بنسبة 68%!",
  "💡 نصيحة: القراءة قبل النوم تحسّن جودة نومك",
  "💡 حقيقة: الكتب تجعلك أكثر تعاطفاً مع الآخرين",
  "💡 هل تعلم؟ القراءة تبطئ الشيخوخة الذهنية",
  "💡 معلومة: 30 دقيقة قراءة يومياً = 18 كتاب سنوياً!",
  "💡 نصيحة: دوّن ملاحظاتك أثناء القراءة",
];

export const sendBookPdfTool = createTool({
  id: "send_book_pdf",
  
  description: `أداة لإرسال ملف PDF الكتاب مباشرة للمستخدم.
استخدم هذه الأداة عندما يطلب المستخدم "أرسل لي الكتاب" أو "أريد الملف" أو "pdf" أو "ملف الكتاب".
الأداة تبحث عن رابط PDF مباشر، تتحقق منه، ثم ترسل الملف للمستخدم.

الحد الأقصى لحجم الملف: 50 ميجابايت`,

  inputSchema: z.object({
    bookName: z.string().describe("اسم الكتاب أو الرواية"),
    authorName: z.string().optional().describe("اسم المؤلف (اختياري)"),
    chatId: z.string().describe("معرف المحادثة لإرسال الملف (رقم كنص)"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    fileName: z.string().optional(),
    fileSize: z.string().optional(),
    pdfAvailable: z.boolean(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookName, authorName, chatId } = context;
    
    logger?.info("📄 [sendBookPdf] بدء البحث عن PDF:", { bookName, authorName, chatId });

    if (!FIRECRAWL_API_KEY) {
      return {
        success: false,
        message: "⚠️ خدمة البحث غير متاحة حالياً",
        pdfAvailable: false,
      };
    }

    if (!TELEGRAM_BOT_TOKEN) {
      return {
        success: false,
        message: "⚠️ خدمة الإرسال غير متاحة",
        pdfAvailable: false,
      };
    }

    try {
      const statusMsg = await sendAnimatedStatus(chatId, bookName, "start");
      const statusMessageId = statusMsg?.message_id;

      await updateProgress(chatId, statusMessageId, bookName, 1);
      
      const searchQuery = authorName 
        ? `${bookName} ${authorName} pdf download`
        : `${bookName} pdf تحميل مباشر`;

      logger?.info("🔍 [sendBookPdf] البحث عن رابط PDF:", { searchQuery });

      await updateProgress(chatId, statusMessageId, bookName, 2);

      const response = await fetch(FIRECRAWL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 15,
          lang: "ar",
          scrapeOptions: {
            formats: ["markdown", "links"],
          },
        }),
      });

      await updateProgress(chatId, statusMessageId, bookName, 4);

      if (!response.ok) {
        logger?.error("❌ [sendBookPdf] خطأ في البحث");
        await deleteMessage(chatId, statusMessageId);
        return {
          success: false,
          message: "⚠️ حدث خطأ أثناء البحث. يرجى المحاولة لاحقاً.",
          pdfAvailable: false,
        };
      }

      const data = await response.json();
      const results = data?.data || [];

      logger?.info("📦 [sendBookPdf] نتائج البحث:", { count: results.length });

      await updateProgress(chatId, statusMessageId, bookName, 5);

      const pdfLink = await findDirectPdfLink(results, bookName, logger);

      if (!pdfLink) {
        logger?.info("📭 [sendBookPdf] لا يوجد رابط PDF مباشر");
        await updateStatusMessage(chatId, statusMessageId, 
          `╔══════════════════════════╗\n` +
          `   📭 <b>لم أجد ملف PDF</b>\n` +
          `╚══════════════════════════╝\n\n` +
          `📚 الكتاب: <b>${bookName}</b>\n\n` +
          `┌─────────────────────┐\n` +
          `│ ${generateProgressBar(5)} │ توقف\n` +
          `└─────────────────────┘\n\n` +
          `💡 <b>نصائح للبحث:</b>\n` +
          `├ 🔤 جرب اسم مختلف للكتاب\n` +
          `├ ✍️ أضف اسم المؤلف\n` +
          `└ 🔗 اطلب "روابط تحميل" بدلاً من الملف`
        );
        return {
          success: false,
          message: `لم أجد ملف PDF مباشر لـ "${bookName}". جرب طلب روابط التحميل.`,
          pdfAvailable: false,
        };
      }

      logger?.info("✅ [sendBookPdf] وجدت رابط PDF:", { url: pdfLink.url });

      await updateProgress(chatId, statusMessageId, bookName, 7, "verify");

      const pdfInfo = await verifyAndGetPdfInfo(pdfLink.url, logger);

      if (!pdfInfo.valid) {
        await updateStatusMessage(chatId, statusMessageId,
          `╔══════════════════════════╗\n` +
          `   ⚠️ <b>الملف غير متاح</b>\n` +
          `╚══════════════════════════╝\n\n` +
          `📚 الكتاب: <b>${bookName}</b>\n\n` +
          `┌─────────────────────┐\n` +
          `│ ${generateProgressBar(7)} │ توقف\n` +
          `└─────────────────────┘\n\n` +
          `💡 جرب: "روابط تحميل ${bookName}"`
        );
        return {
          success: false,
          message: `الملف غير متاح أو تالف. جرب طلب روابط التحميل.`,
          pdfAvailable: false,
        };
      }

      if (pdfInfo.size && pdfInfo.size > MAX_FILE_SIZE) {
        const sizeMB = (pdfInfo.size / (1024 * 1024)).toFixed(1);
        await updateStatusMessage(chatId, statusMessageId,
          `╔══════════════════════════╗\n` +
          `   📦 <b>الملف كبير جداً!</b>\n` +
          `╚══════════════════════════╝\n\n` +
          `📚 الكتاب: <b>${bookName}</b>\n` +
          `📊 الحجم: <b>${sizeMB}</b> ميجابايت\n` +
          `⚠️ الحد الأقصى: 50 ميجابايت\n\n` +
          `┌─────────────────────┐\n` +
          `│ ${generateProgressBar(10)} │ جاهز\n` +
          `└─────────────────────┘\n\n` +
          `🔗 <a href="${pdfLink.url}">⬇️ اضغط هنا للتحميل المباشر</a>`
        );
        return {
          success: false,
          message: `الملف كبير (${sizeMB} ميجا). يمكنك تحميله من الرابط.`,
          pdfAvailable: true,
          fileSize: `${sizeMB} MB`,
        };
      }

      await updateProgress(chatId, statusMessageId, bookName, 9, "upload");

      await sendChatAction(chatId, "upload_document");

      const sendResult = await sendPdfToTelegram(chatId, pdfLink.url, bookName, authorName, logger);

      if (sendResult.success) {
        const sizeMB = pdfInfo.size ? (pdfInfo.size / (1024 * 1024)).toFixed(1) : "غير معروف";
        
        await updateStatusMessage(chatId, statusMessageId,
          `╔══════════════════════════╗\n` +
          `   🎉 <b>تم بنجاح!</b> 🎉\n` +
          `╚══════════════════════════╝\n\n` +
          `📚 <b>${bookName}</b>\n` +
          `${authorName ? `✍️ <i>${authorName}</i>\n` : ""}` +
          `📊 الحجم: <b>${sizeMB}</b> ميجابايت\n\n` +
          `┌─────────────────────┐\n` +
          `│ ${generateProgressBar(10)} │ 100%\n` +
          `└─────────────────────┘\n\n` +
          `📖 <b>استمتع بالقراءة!</b>\n\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `💬 أرسل اسم كتاب آخر للبحث عنه\n` +
          `⭐ لا تنسَ إضافته للمفضلة!`
        );
        
        return {
          success: true,
          message: `تم إرسال "${bookName}" بنجاح!`,
          fileName: `${bookName}.pdf`,
          fileSize: `${sizeMB} MB`,
          pdfAvailable: true,
        };
      } else {
        await updateStatusMessage(chatId, statusMessageId,
          `╔══════════════════════════╗\n` +
          `   ⚠️ <b>لم أتمكن من الإرسال</b>\n` +
          `╚══════════════════════════╝\n\n` +
          `📚 الكتاب: <b>${bookName}</b>\n\n` +
          `┌─────────────────────┐\n` +
          `│ ${generateProgressBar(9)} │ متوقف\n` +
          `└─────────────────────┘\n\n` +
          `🔗 <a href="${pdfLink.url}">⬇️ اضغط هنا للتحميل المباشر</a>`
        );
        return {
          success: false,
          message: `لم أتمكن من إرسال الملف. يمكنك تحميله من الرابط.`,
          pdfAvailable: true,
        };
      }

    } catch (error) {
      logger?.error("❌ [sendBookPdf] خطأ:", error);
      return {
        success: false,
        message: "⚠️ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
        pdfAvailable: false,
      };
    }
  },
});

async function sendAnimatedStatus(chatId: string, bookName: string, stage: string): Promise<any> {
  try {
    const randomTip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    const bookEmoji = BOOK_LOADING_FRAMES[0];
    
    const message = 
      `╔══════════════════════╗\n` +
      `       ${bookEmoji} <b>خلاصة الكتب</b> ${bookEmoji}\n` +
      `╚══════════════════════╝\n\n` +
      `🔮 <b>أستحضر كتابك من عالم المعرفة...</b>\n\n` +
      `📚 <b>${bookName}</b>\n\n` +
      `┌─────────────────────┐\n` +
      `│ ${generateProgressBar(0)} │ 0%\n` +
      `└─────────────────────┘\n\n` +
      `✨ <i>السحر يبدأ...</i>\n\n` +
      `${randomTip}`;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
    
    const result = await response.json();
    return result.result;
  } catch {
    return null;
  }
}

async function updateProgress(
  chatId: string, 
  messageId: number | undefined, 
  bookName: string, 
  step: number,
  stage: string = "search"
): Promise<void> {
  if (!messageId) return;
  
  const animationIndex = Math.min(step, SEARCH_ANIMATIONS.length - 1);
  const animation = SEARCH_ANIMATIONS[animationIndex];
  const bookEmoji = BOOK_LOADING_FRAMES[step % BOOK_LOADING_FRAMES.length];
  const percentage = Math.min(step * 10, 100);
  
  let statusEmoji = animation.emoji;
  let statusText = animation.text;
  let subText = animation.subtext;
  
  if (stage === "verify") {
    statusEmoji = "🔎";
    statusText = "وجدت الكتاب! أتحقق من جودته...";
    subText = "✅ تأكيد الجودة";
  } else if (stage === "upload") {
    statusEmoji = "🚀";
    statusText = "جاري إرسال الكتاب إليك!";
    subText = "📤 الإرسال قيد التنفيذ";
  }
  
  const randomTip = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
  
  const message = 
    `╔══════════════════════╗\n` +
    `       ${bookEmoji} <b>خلاصة الكتب</b> ${bookEmoji}\n` +
    `╚══════════════════════╝\n\n` +
    `${statusEmoji} <b>${statusText}</b>\n\n` +
    `📚 <b>${bookName}</b>\n\n` +
    `┌─────────────────────┐\n` +
    `│ ${generateProgressBar(step)} │ ${percentage}%\n` +
    `└─────────────────────┘\n\n` +
    `${subText}\n\n` +
    `${randomTip}`;

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
  } catch {}
}

async function updateStatusMessage(chatId: string, messageId: number | undefined, text: string): Promise<void> {
  if (!messageId) return;
  
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );
  } catch {}
}

async function deleteMessage(chatId: string, messageId: number | undefined): Promise<void> {
  if (!messageId) return;
  
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
        }),
      }
    );
  } catch {}
}

interface PdfLink {
  url: string;
  source: string;
  priority: number;
}

async function findDirectPdfLink(results: any[], bookName: string, logger: any): Promise<PdfLink | null> {
  const pdfLinks: PdfLink[] = [];

  for (const result of results) {
    const url = result.url || "";
    const markdown = result.markdown || "";
    const links = result.links || [];

    if (url.toLowerCase().endsWith(".pdf")) {
      const domain = extractDomain(url);
      const isTrusted = TRUSTED_PDF_DOMAINS.some(td => domain.includes(td));
      pdfLinks.push({
        url,
        source: domain,
        priority: isTrusted ? 100 : 50,
      });
    }

    for (const link of links) {
      if (typeof link === "string" && link.toLowerCase().endsWith(".pdf")) {
        const domain = extractDomain(link);
        const isTrusted = TRUSTED_PDF_DOMAINS.some(td => domain.includes(td));
        pdfLinks.push({
          url: link,
          source: domain,
          priority: isTrusted ? 90 : 40,
        });
      }
    }

    const pdfMatches = markdown.match(/https?:\/\/[^\s\)]+\.pdf/gi) || [];
    for (const pdfUrl of pdfMatches) {
      const domain = extractDomain(pdfUrl);
      const isTrusted = TRUSTED_PDF_DOMAINS.some(td => domain.includes(td));
      pdfLinks.push({
        url: pdfUrl,
        source: domain,
        priority: isTrusted ? 80 : 30,
      });
    }
  }

  pdfLinks.sort((a, b) => b.priority - a.priority);

  for (const link of pdfLinks.slice(0, 5)) {
    const isValid = await quickVerifyPdf(link.url);
    if (isValid) {
      return link;
    }
  }

  return pdfLinks[0] || null;
}

async function quickVerifyPdf(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    
    const contentType = response.headers.get("content-type") || "";
    return response.ok && (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf"));
  } catch {
    return false;
  }
}

async function verifyAndGetPdfInfo(url: string, logger: any): Promise<{ valid: boolean; size?: number }> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger?.warn("⚠️ [verifyPdf] الملف غير متاح:", { status: response.status });
      return { valid: false };
    }

    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type") || "";

    const isPdf = contentType.includes("pdf") || 
                  contentType.includes("octet-stream") ||
                  url.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      logger?.warn("⚠️ [verifyPdf] ليس ملف PDF:", { contentType });
      return { valid: false };
    }

    return {
      valid: true,
      size: contentLength ? parseInt(contentLength) : undefined,
    };
  } catch (error) {
    logger?.error("❌ [verifyPdf] خطأ:", error);
    return { valid: false };
  }
}

async function sendPdfToTelegram(
  chatId: string, 
  pdfUrl: string, 
  bookName: string,
  authorName: string | undefined,
  logger: any
): Promise<{ success: boolean }> {
  try {
    const caption = authorName 
      ? `📚 <b>${bookName}</b>\n✍️ <i>${authorName}</i>\n\n📖 من بوت خلاصة الكتب`
      : `📚 <b>${bookName}</b>\n\n📖 من بوت خلاصة الكتب`;

    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          document: pdfUrl,
          caption: caption,
          parse_mode: "HTML",
        }),
      }
    );

    const result = await response.json();
    
    if (!result.ok) {
      logger?.error("❌ [sendPdf] خطأ من تيليجرام:", result);
      return { success: false };
    }

    logger?.info("✅ [sendPdf] تم إرسال الملف بنجاح");
    return { success: true };
  } catch (error) {
    logger?.error("❌ [sendPdf] خطأ في الإرسال:", error);
    return { success: false };
  }
}

async function sendTypingAction(chatId: string): Promise<void> {
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          action: "typing",
        }),
      }
    );
  } catch {}
}

async function sendChatAction(chatId: string, action: string): Promise<void> {
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          action: action,
        }),
      }
    );
  } catch {}
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}
