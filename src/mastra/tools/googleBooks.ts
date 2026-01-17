import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const googleBooksInfoTool = createTool({
  id: "google_books_info",
  description: "جلب معلومات تفصيلية عن كتاب من Google Books API (الوصف، المؤلف، التصنيف، رابط المعاينة، صورة الغلاف، التقييم، عدد الصفحات). استخدمها لتقديم نبذة احترافية للمستخدم قبل أو أثناء طلب الكتاب.",
  inputSchema: z.object({
    bookTitle: z.string().describe("عنوان الكتاب للبحث عنه"),
    author: z.string().optional().describe("اسم المؤلف لتدقيق البحث"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    bookInfo: z.object({
      title: z.string(),
      authors: z.array(z.string()).optional(),
      description: z.string().optional(),
      categories: z.array(z.string()).optional(),
      pageCount: z.number().optional(),
      averageRating: z.number().optional(),
      thumbnail: z.string().optional(),
      previewLink: z.string().optional(),
      infoLink: z.string().optional(),
      publishedDate: z.string().optional(),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookTitle, author } = context;
    
    logger?.info("📚 [GoogleBooks] جلب بيانات الكتاب:", { bookTitle, author });
    
    try {
      const query = encodeURIComponent(`${bookTitle}${author ? ` ${author}` : ""}`);
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1&langRestrict=ar`);
      
      if (!response.ok) {
        throw new Error(`Google Books API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return {
          success: false,
          message: "لم أجد بيانات تفصيلية لهذا الكتاب في قاعدة بيانات Google Books.",
        };
      }
      
      const volumeInfo = data.items[0].volumeInfo;
      
      return {
        success: true,
        bookInfo: {
          title: volumeInfo.title,
          authors: volumeInfo.authors,
          description: volumeInfo.description,
          categories: volumeInfo.categories,
          pageCount: volumeInfo.pageCount,
          averageRating: volumeInfo.averageRating,
          thumbnail: volumeInfo.imageLinks?.thumbnail,
          previewLink: volumeInfo.previewLink,
          infoLink: volumeInfo.infoLink,
          publishedDate: volumeInfo.publishedDate,
        },
        message: "تم العثور على بيانات الكتاب بنجاح.",
      };
    } catch (error) {
      logger?.error("❌ [GoogleBooks] خطأ:", error);
      return {
        success: false,
        message: "عذراً، حدث خطأ أثناء جلب بيانات الكتاب من Google Books.",
      };
    }
  },
});
