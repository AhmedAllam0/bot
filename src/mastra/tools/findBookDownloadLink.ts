import { createTool } from "@mastra/core/tools";
import { z } from "zod";

/**
 * أداة البحث عن روابط تحميل الكتب باستخدام Firecrawl API
 * تبحث في الويب عن روابط تحميل الكتب والروايات العربية
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/search";

// قائمة المواقع الموثوقة لتحميل الكتب العربية
const TRUSTED_DOMAINS = [
  "kutub-pdf.net",
  "foulabook.com",
  "books-library.net",
  "noor-book.com",
  "hindawi.org",
  "abjjad.com",
  "kutubpdfmaktaba.com",
  "maktabet-alhusam.blogspot.com",
  "3asq.com",
  "bookfree22.blogspot.com",
];

// أنماط الروابط المباشرة للتحميل
const DOWNLOAD_PATTERNS = [
  /\.pdf$/i,
  /\.epub$/i,
  /\.mobi$/i,
  /download/i,
  /تحميل/i,
  /تنزيل/i,
];

interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

interface ProcessedResult {
  url: string;
  title: string;
  description: string;
  source: string;
  isTrusted: boolean;
  hasDownloadLink: boolean;
  priority: number;
}

export const findBookDownloadLinkTool = createTool({
  id: "find_book_download_link",
  
  description: `أداة للبحث عن روابط تحميل الكتب والروايات العربية.
استخدم هذه الأداة عندما يطلب المستخدم البحث عن كتاب أو رواية للتحميل.
الأداة تبحث في الويب وتعيد روابط تحميل موثوقة مع تصنيف حسب الجودة.

متى تستخدم هذه الأداة:
- عندما يطلب المستخدم تحميل كتاب أو رواية
- عندما يسأل عن رابط تحميل
- عندما يذكر اسم كتاب ويريد الحصول عليه

لا تستخدم هذه الأداة:
- للأسئلة العامة عن الكتب
- للمحادثات العادية`,

  inputSchema: z.object({
    bookName: z.string().describe("اسم الكتاب أو الرواية للبحث عنها"),
    authorName: z.string().optional().describe("اسم المؤلف (اختياري لتحسين نتائج البحث)"),
  }),

  outputSchema: z.object({
    success: z.boolean(),
    bookName: z.string(),
    results: z.array(z.object({
      url: z.string(),
      title: z.string(),
      description: z.string(),
      source: z.string(),
      isTrusted: z.boolean(),
      priority: z.number(),
    })),
    totalResults: z.number(),
    message: z.string(),
  }),

  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookName, authorName } = context;
    
    logger?.info("🔍 [findBookDownloadLink] بدء البحث عن:", { bookName, authorName });

    if (!FIRECRAWL_API_KEY) {
      logger?.error("❌ [findBookDownloadLink] مفتاح Firecrawl API غير موجود");
      return {
        success: false,
        bookName,
        results: [],
        totalResults: 0,
        message: "⚠️ عذراً، خدمة البحث غير متاحة حالياً. يرجى المحاولة لاحقاً.",
      };
    }

    try {
      // بناء استعلام البحث
      const searchQuery = authorName 
        ? `تحميل ${bookName} ${authorName} pdf`
        : `تحميل ${bookName} pdf`;

      logger?.info("📝 [findBookDownloadLink] استعلام البحث:", { searchQuery });

      // استدعاء Firecrawl API
      const response = await fetch(FIRECRAWL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: searchQuery,
          limit: 10,
          lang: "ar",
          country: "eg",
          scrapeOptions: {
            formats: ["markdown"],
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger?.error("❌ [findBookDownloadLink] خطأ من Firecrawl:", { status: response.status, error: errorText });
        return {
          success: false,
          bookName,
          results: [],
          totalResults: 0,
          message: "⚠️ حدث خطأ أثناء البحث. يرجى المحاولة مرة أخرى.",
        };
      }

      const data = await response.json();
      logger?.info("📦 [findBookDownloadLink] نتائج Firecrawl:", { count: data?.data?.length || 0 });

      const rawResults: FirecrawlResult[] = data?.data || [];

      if (rawResults.length === 0) {
        logger?.info("📭 [findBookDownloadLink] لا توجد نتائج");
        return {
          success: true,
          bookName,
          results: [],
          totalResults: 0,
          message: `📚 عذراً، لم أجد روابط تحميل لـ "${bookName}". جرب البحث باسم مختلف أو أضف اسم المؤلف.`,
        };
      }

      // معالجة وتصنيف النتائج
      const processedResults: ProcessedResult[] = rawResults.map((result) => {
        const url = result.url || "";
        const domain = extractDomain(url);
        const isTrusted = TRUSTED_DOMAINS.some(td => domain.includes(td));
        const hasDownloadLink = DOWNLOAD_PATTERNS.some(pattern => 
          pattern.test(url) || pattern.test(result.title || "") || pattern.test(result.description || "")
        );

        // حساب الأولوية
        let priority = 0;
        if (isTrusted) priority += 50;
        if (hasDownloadLink) priority += 30;
        if (result.title?.includes(bookName)) priority += 20;
        if (result.description?.includes(bookName)) priority += 10;

        return {
          url,
          title: result.title || "بدون عنوان",
          description: result.description || extractDescription(result.markdown || ""),
          source: domain,
          isTrusted,
          hasDownloadLink,
          priority,
        };
      });

      // ترتيب حسب الأولوية
      processedResults.sort((a, b) => b.priority - a.priority);

      // أخذ أفضل 5 نتائج
      const topResults = processedResults.slice(0, 5);

      logger?.info("✅ [findBookDownloadLink] تم معالجة النتائج:", { count: topResults.length });

      return {
        success: true,
        bookName,
        results: topResults.map(r => ({
          url: r.url,
          title: r.title,
          description: r.description.substring(0, 200),
          source: r.source,
          isTrusted: r.isTrusted,
          priority: r.priority,
        })),
        totalResults: topResults.length,
        message: `📚 وجدت ${topResults.length} روابط لتحميل "${bookName}"`,
      };

    } catch (error) {
      logger?.error("❌ [findBookDownloadLink] خطأ غير متوقع:", error);
      return {
        success: false,
        bookName,
        results: [],
        totalResults: 0,
        message: "⚠️ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
      };
    }
  },
});

// دوال مساعدة
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}

function extractDescription(markdown: string): string {
  // استخراج أول 200 حرف من المحتوى
  const cleaned = markdown
    .replace(/[#*_\[\]()]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return cleaned.substring(0, 200);
}
