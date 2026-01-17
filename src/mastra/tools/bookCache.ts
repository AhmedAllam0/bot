import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool } from "../db/pool";

export const cacheBookSearch = createTool({
  id: "cache_book_search",
  description: "تخزين نتائج البحث عن كتاب في ذاكرة التخزين المؤقت",
  inputSchema: z.object({
    bookName: z.string().describe("اسم الكتاب"),
    pdfUrl: z.string().optional().describe("رابط PDF"),
    downloadLinks: z.array(z.string()).optional().describe("روابط التحميل"),
    summary: z.string().optional().describe("ملخص الكتاب"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookName, pdfUrl, downloadLinks, summary } = context;
    
    logger?.info("💾 [BookCache] تخزين نتائج البحث:", { bookName });
    
    try {
      const normalizedName = bookName.trim().toLowerCase();
      
      await sharedPool.query(`
        INSERT INTO book_cache (book_name_normalized, book_name_original, pdf_url, download_links, summary, search_count, last_searched_at)
        VALUES ($1, $2, $3, $4, $5, 1, NOW())
        ON CONFLICT (book_name_normalized) DO UPDATE SET
          pdf_url = COALESCE($3, book_cache.pdf_url),
          download_links = COALESCE($4, book_cache.download_links),
          summary = COALESCE($5, book_cache.summary),
          search_count = book_cache.search_count + 1,
          last_searched_at = NOW()
      `, [normalizedName, bookName, pdfUrl, JSON.stringify(downloadLinks || []), summary]);
      
      logger?.info("✅ [BookCache] تم التخزين بنجاح");
      return { success: true, message: "تم تخزين الكتاب" };
    } catch (error: any) {
      logger?.error("❌ [BookCache] خطأ:", error);
      return { success: false, message: error.message };
    }
  },
});

export const getCachedBook = createTool({
  id: "get_cached_book",
  description: "البحث عن كتاب في ذاكرة التخزين المؤقت",
  inputSchema: z.object({
    bookName: z.string().describe("اسم الكتاب للبحث"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    bookName: z.string().optional(),
    pdfUrl: z.string().optional(),
    downloadLinks: z.array(z.string()).optional(),
    summary: z.string().optional(),
    searchCount: z.number().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookName } = context;
    
    logger?.info("🔍 [BookCache] البحث في الذاكرة المؤقتة:", { bookName });
    
    try {
      const normalizedName = bookName.trim().toLowerCase();
      
      const result = await sharedPool.query(`
        SELECT book_name_original, pdf_url, download_links, summary, search_count
        FROM book_cache
        WHERE book_name_normalized = $1
          OR book_name_normalized LIKE $2
          OR book_name_original ILIKE $3
        ORDER BY search_count DESC
        LIMIT 1
      `, [normalizedName, `%${normalizedName}%`, `%${bookName}%`]);
      
      if (result.rows.length > 0) {
        const book = result.rows[0];
        logger?.info("✅ [BookCache] وُجد في الذاكرة المؤقتة");
        return {
          found: true,
          bookName: book.book_name_original,
          pdfUrl: book.pdf_url,
          downloadLinks: book.download_links ? JSON.parse(book.download_links) : [],
          summary: book.summary,
          searchCount: book.search_count,
        };
      }
      
      logger?.info("⚠️ [BookCache] غير موجود في الذاكرة المؤقتة");
      return { found: false };
    } catch (error: any) {
      logger?.error("❌ [BookCache] خطأ:", error);
      return { found: false };
    }
  },
});

export const getPopularBooks = createTool({
  id: "get_popular_books",
  description: "الحصول على قائمة الكتب الأكثر بحثاً",
  inputSchema: z.object({
    limit: z.number().optional().default(10).describe("عدد الكتب"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    books: z.array(z.object({
      name: z.string(),
      searchCount: z.number(),
      hasPdf: z.boolean(),
    })),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const limit = context.limit || 10;
    
    logger?.info("📊 [BookCache] جلب الكتب الأكثر بحثاً");
    
    try {
      const result = await sharedPool.query(`
        SELECT book_name_original, search_count, pdf_url IS NOT NULL as has_pdf
        FROM book_cache
        ORDER BY search_count DESC
        LIMIT $1
      `, [limit]);
      
      const books = result.rows.map(row => ({
        name: row.book_name_original,
        searchCount: row.search_count,
        hasPdf: row.has_pdf,
      }));
      
      logger?.info("✅ [BookCache] تم جلب الكتب الشائعة:", { count: books.length });
      return { success: true, books };
    } catch (error: any) {
      logger?.error("❌ [BookCache] خطأ:", error);
      return { success: false, books: [] };
    }
  },
});
