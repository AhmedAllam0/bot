import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool as pool } from "../db/pool";

export const manageFavoritesTool = createTool({
  id: "manage_favorites",
  description: "إدارة قائمة الكتب المفضلة للمستخدم (إضافة أو إزالة كتاب). استخدم هذه الأداة عندما يريد المستخدم حفظ كتاب في المفضلة أو إزالته.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    action: z.enum(["add", "remove"]).describe("الإجراء: add لإضافة، remove لإزالة"),
    bookTitle: z.string().describe("عنوان الكتاب"),
    bookAuthor: z.string().optional().describe("اسم المؤلف"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    action: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId, action, bookTitle, bookAuthor } = context;
    
    logger?.info("⭐ [manageFavorites] إدارة المفضلة:", { telegramId, action, bookTitle });
    
    if (!process.env.DATABASE_URL) {
      return { 
        success: false, 
        message: "خطأ في إعدادات قاعدة البيانات", 
        action 
      };
    }

    try {
      if (action === "add") {
        await pool.query(
          `INSERT INTO user_favorites (telegram_id, book_title, book_author)
           VALUES ($1, $2, $3)
           ON CONFLICT (telegram_id, book_title) DO NOTHING`,
          [telegramId, bookTitle, bookAuthor || "غير محدد"]
        );
        
        logger?.info("✅ [manageFavorites] تمت الإضافة بنجاح");
        return {
          success: true,
          message: `✅ تمت إضافة "<b>${bookTitle}</b>" إلى قائمة المفضلة!\n\n💡 استخدم /favorites لعرض قائمتك`,
          action,
        };
      } else {
        const result = await pool.query(
          `DELETE FROM user_favorites 
           WHERE telegram_id = $1 AND book_title = $2
           RETURNING id`,
          [telegramId, bookTitle]
        );
        
        if (result.rowCount === 0) {
          return {
            success: false,
            message: `⚠️ الكتاب "<b>${bookTitle}</b>" غير موجود في قائمة المفضلة`,
            action,
          };
        }
        
        logger?.info("✅ [manageFavorites] تمت الإزالة بنجاح");
        return {
          success: true,
          message: `🗑️ تمت إزالة "<b>${bookTitle}</b>" من قائمة المفضلة`,
          action,
        };
      }
    } catch (error) {
      logger?.error("❌ [manageFavorites] خطأ:", { error });
      return {
        success: false,
        message: "عذراً، حدث خطأ في حفظ المفضلة. يرجى المحاولة لاحقاً.",
        action,
      };
    }
  },
});

export const getFavoritesTool = createTool({
  id: "get_favorites",
  description: "الحصول على قائمة الكتب المفضلة للمستخدم. استخدم هذه الأداة عندما يطلب المستخدم عرض قائمة مفضلاته أو /favorites.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    favorites: z.array(z.object({
      title: z.string(),
      author: z.string(),
      addedAt: z.string(),
    })),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { telegramId } = context;
    
    logger?.info("📚 [getFavorites] جلب قائمة المفضلة:", { telegramId });
    
    if (!process.env.DATABASE_URL) {
      return { 
        success: false, 
        favorites: [],
        message: "خطأ في إعدادات قاعدة البيانات" 
      };
    }

    try {
      const result = await pool.query(
        `SELECT book_title, book_author, added_at 
         FROM user_favorites 
         WHERE telegram_id = $1 
         ORDER BY added_at DESC
         LIMIT 50`,
        [telegramId]
      );
      
      const favorites = result.rows.map(row => ({
        title: row.book_title,
        author: row.book_author,
        addedAt: row.added_at.toISOString(),
      }));
      
      logger?.info("✅ [getFavorites] تم جلب المفضلة:", { count: favorites.length });
      
      if (favorites.length === 0) {
        return {
          success: true,
          favorites: [],
          message: `<b>⭐ قائمة المفضلة</b>\n\n📭 قائمتك فارغة حالياً!\n\n💡 <i>لإضافة كتاب، قل:</i>\n<code>أضف [اسم الكتاب] للمفضلة</code>`,
        };
      }
      
      let message = `<b>⭐ قائمة المفضلة (${favorites.length} كتاب)</b>\n\n`;
      favorites.forEach((book, index) => {
        message += `${index + 1}. <b>${book.title}</b>\n`;
        message += `   ✍️ <i>${book.author}</i>\n\n`;
      });
      message += `━━━━━━━━━━━━━━━\n💡 لإزالة كتاب، قل: <code>احذف [اسم الكتاب] من المفضلة</code>`;
      
      return {
        success: true,
        favorites,
        message,
      };
    } catch (error) {
      logger?.error("❌ [getFavorites] خطأ:", { error });
      return {
        success: false,
        favorites: [],
        message: "عذراً، حدث خطأ في جلب قائمة المفضلة. يرجى المحاولة لاحقاً.",
      };
    }
  },
});
