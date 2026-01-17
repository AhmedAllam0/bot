import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool } from "../db/pool";

export const advancedBookSearch = createTool({
  id: "advanced_book_search",
  description: "بحث متقدم عن الكتب بفلاتر متعددة (المؤلف، الفئة، السنة، اللغة)",
  inputSchema: z.object({
    query: z.string().optional().describe("نص البحث"),
    author: z.string().optional().describe("اسم المؤلف"),
    category: z.enum(["رواية", "شعر", "تاريخ", "فلسفة", "علمي", "ديني", "سيرة ذاتية", "تنمية ذاتية", "أطفال"]).optional().describe("الفئة"),
    sortBy: z.enum(["popularity", "newest", "alphabetical"]).optional().default("popularity").describe("الترتيب"),
    limit: z.number().optional().default(10).describe("عدد النتائج"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.object({
      name: z.string(),
      author: z.string().optional(),
      category: z.string().optional(),
      hasPdf: z.boolean(),
      searchCount: z.number(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { query, author, category, sortBy, limit } = context;
    
    logger?.info("🔍 [AdvancedSearch] بحث متقدم:", { query, author, category, sortBy });
    
    try {
      let sqlQuery = `
        SELECT book_name_original, author, category, pdf_url IS NOT NULL as has_pdf, search_count
        FROM book_cache
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;
      
      if (query) {
        sqlQuery += ` AND (book_name_original ILIKE $${paramIndex} OR book_name_normalized LIKE $${paramIndex + 1})`;
        params.push(`%${query}%`, `%${query.toLowerCase()}%`);
        paramIndex += 2;
      }
      
      if (author) {
        sqlQuery += ` AND author ILIKE $${paramIndex}`;
        params.push(`%${author}%`);
        paramIndex++;
      }
      
      if (category) {
        sqlQuery += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }
      
      const orderClause = sortBy === "newest" ? "created_at DESC" :
                          sortBy === "alphabetical" ? "book_name_original ASC" :
                          "search_count DESC";
      
      sqlQuery += ` ORDER BY ${orderClause} LIMIT $${paramIndex}`;
      params.push(limit || 10);
      
      const result = await sharedPool.query(sqlQuery, params);
      
      const results = result.rows.map((row: any) => ({
        name: row.book_name_original,
        author: row.author,
        category: row.category,
        hasPdf: row.has_pdf,
        searchCount: row.search_count,
      }));
      
      logger?.info("✅ [AdvancedSearch] نتائج البحث:", { count: results.length });
      
      return {
        success: true,
        results,
        message: results.length > 0 
          ? `وجدت ${results.length} كتاب` 
          : "لم أجد كتب تطابق بحثك. جرب البحث بكلمات مختلفة!",
      };
    } catch (error: any) {
      logger?.error("❌ [AdvancedSearch] خطأ:", error);
      return { success: false, results: [], message: "حدث خطأ في البحث" };
    }
  },
});

export const getReadingStatistics = createTool({
  id: "get_reading_statistics",
  description: "الحصول على إحصائيات القراءة للمستخدم",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      totalSearches: z.number(),
      favoriteCategory: z.string().optional(),
      favoriteAuthor: z.string().optional(),
      dailyStreak: z.number(),
      memberSince: z.string().optional(),
      totalPoints: z.number(),
      currentTitle: z.string(),
      booksDownloaded: z.number(),
    }),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId } = context;
    
    logger?.info("📊 [ReadingStats] جلب إحصائيات المستخدم:", { telegramId });
    
    try {
      const userResult = await sharedPool.query(`
        SELECT total_points, daily_streak, title_id, created_at
        FROM competition_users
        WHERE telegram_id = $1
      `, [telegramId]);
      
      const searchResult = await sharedPool.query(`
        SELECT COUNT(*) as total_searches
        FROM message_logs
        WHERE telegram_id = $1 AND message_type = 'book_search'
      `, [telegramId]);
      
      const downloadResult = await sharedPool.query(`
        SELECT COUNT(*) as downloads
        FROM message_logs
        WHERE telegram_id = $1 AND message_type = 'pdf_download'
      `, [telegramId]);
      
      const titles = [
        { id: 1, name: "📖 مبتدئ", points: 0 },
        { id: 2, name: "📚 قارئ", points: 100 },
        { id: 3, name: "🎓 مثقف", points: 300 },
        { id: 4, name: "✍️ أديب", points: 600 },
        { id: 5, name: "🏛️ عالم", points: 1000 },
        { id: 6, name: "🦉 حكيم", points: 1500 },
        { id: 7, name: "🌟 فيلسوف", points: 2500 },
        { id: 8, name: "👑 أسطورة", points: 4000 },
        { id: 9, name: "🧠 عبقري", points: 6000 },
        { id: 10, name: "⭐ خالد", points: 10000 },
      ];
      
      const user = userResult.rows[0] || {};
      const currentTitle = titles.find(t => t.id === (user.title_id || 1))?.name || "📖 مبتدئ";
      
      const stats = {
        totalSearches: parseInt(searchResult.rows[0]?.total_searches || "0"),
        booksDownloaded: parseInt(downloadResult.rows[0]?.downloads || "0"),
        dailyStreak: user.daily_streak || 0,
        totalPoints: user.total_points || 0,
        currentTitle,
        memberSince: user.created_at?.toISOString(),
        favoriteCategory: undefined,
        favoriteAuthor: undefined,
      };
      
      logger?.info("✅ [ReadingStats] تم جلب الإحصائيات");
      return { success: true, stats };
    } catch (error: any) {
      logger?.error("❌ [ReadingStats] خطأ:", error);
      return { 
        success: false, 
        stats: {
          totalSearches: 0,
          booksDownloaded: 0,
          dailyStreak: 0,
          totalPoints: 0,
          currentTitle: "📖 مبتدئ",
        }
      };
    }
  },
});

export const getTopBooksThisWeek = createTool({
  id: "get_top_books_this_week",
  description: "الحصول على أكثر الكتب بحثاً هذا الأسبوع",
  inputSchema: z.object({
    limit: z.number().optional().default(5).describe("عدد الكتب"),
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
    const limit = context.limit || 5;
    
    logger?.info("📈 [TopBooks] جلب أكثر الكتب بحثاً");
    
    try {
      const result = await sharedPool.query(`
        SELECT book_name_original, search_count, pdf_url IS NOT NULL as has_pdf
        FROM book_cache
        WHERE last_searched_at > NOW() - INTERVAL '7 days'
        ORDER BY search_count DESC
        LIMIT $1
      `, [limit]);
      
      const books = result.rows.map((row: any) => ({
        name: row.book_name_original,
        searchCount: row.search_count,
        hasPdf: row.has_pdf,
      }));
      
      logger?.info("✅ [TopBooks] تم جلب الكتب الأكثر بحثاً:", { count: books.length });
      return { success: true, books };
    } catch (error: any) {
      logger?.error("❌ [TopBooks] خطأ:", error);
      return { success: false, books: [] };
    }
  },
});
