import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const SUPABASE_API_URL = "https://jrtgesujpinzboszijqn.supabase.co/functions/v1/n8n-handler";

export const manageFavoritesTool = createTool({
  id: "manage_favorites",
  description: "إدارة قائمة الكتب المفضلة للمستخدم (إضافة أو إزالة كتاب). استخدم هذه الأداة عندما يريد المستخدم حفظ كتاب في المفضلة أو إزالته.",
  inputSchema: z.object({
    userId: z.string().describe("معرف المستخدم"),
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
    const { userId, action, bookTitle, bookAuthor } = context;
    
    logger?.info("⭐ [manageFavorites] إدارة المفضلة:", { userId, action, bookTitle });
    
    try {
      const response = await fetch(SUPABASE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "manage_favorites",
          data: {
            user_id: userId,
            operation: action,
            book: {
              title: bookTitle,
              author: bookAuthor || "غير محدد",
              added_at: new Date().toISOString(),
            },
          },
        }),
      });
      
      if (response.ok) {
        const actionMessage = action === "add" 
          ? `تمت إضافة "${bookTitle}" إلى قائمة المفضلة بنجاح`
          : `تمت إزالة "${bookTitle}" من قائمة المفضلة بنجاح`;
        
        logger?.info("✅ [manageFavorites] نجاح:", { message: actionMessage });
        return {
          success: true,
          message: actionMessage,
          action,
        };
      }
      
      const errorStatus = response.status;
      logger?.warn("⚠️ [manageFavorites] فشل في الاتصال بالخادم:", { status: errorStatus });
      return {
        success: false,
        message: `عذراً، حدث خطأ في حفظ المفضلة. يرجى المحاولة لاحقاً. (رمز الخطأ: ${errorStatus})`,
        action,
      };
    } catch (error) {
      logger?.error("❌ [manageFavorites] خطأ:", { error });
      return {
        success: false,
        message: "عذراً، لم نتمكن من الاتصال بالخادم. يرجى التحقق من اتصالك والمحاولة لاحقاً.",
        action,
      };
    }
  },
});

export const getFavoritesTool = createTool({
  id: "get_favorites",
  description: "الحصول على قائمة الكتب المفضلة للمستخدم. استخدم هذه الأداة عندما يطلب المستخدم عرض قائمة مفضلاته.",
  inputSchema: z.object({
    userId: z.string().describe("معرف المستخدم"),
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
    const { userId } = context;
    
    logger?.info("📚 [getFavorites] جلب قائمة المفضلة:", { userId });
    
    try {
      const response = await fetch(SUPABASE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "get_favorites",
          data: {
            user_id: userId,
          },
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        logger?.info("✅ [getFavorites] تم جلب المفضلة:", { count: data.favorites?.length || 0 });
        return {
          success: true,
          favorites: data.favorites || [],
          message: data.favorites?.length 
            ? `لديك ${data.favorites.length} كتاب في المفضلة`
            : "قائمة المفضلة فارغة. أضف كتبك المفضلة بقول 'أضف [اسم الكتاب] للمفضلة'",
        };
      }
      
      const errorStatus = response.status;
      logger?.warn("⚠️ [getFavorites] فشل في جلب المفضلة:", { status: errorStatus });
      return {
        success: false,
        favorites: [],
        message: `عذراً، لم نتمكن من جلب قائمة المفضلة. (رمز الخطأ: ${errorStatus})`,
      };
    } catch (error) {
      logger?.error("❌ [getFavorites] خطأ:", { error });
      return {
        success: false,
        favorites: [],
        message: "عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.",
      };
    }
  },
});
