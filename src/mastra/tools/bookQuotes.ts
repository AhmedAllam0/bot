import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getBookQuotesTool = createTool({
  id: "get_book_quotes",
  description: "الحصول على اقتباسات شهيرة من كتاب معين أو لمؤلف معين. استخدم هذه الأداة عندما يطلب المستخدم اقتباسات.",
  inputSchema: z.object({
    bookName: z.string().optional().describe("اسم الكتاب"),
    authorName: z.string().optional().describe("اسم المؤلف"),
    topic: z.string().optional().describe("موضوع الاقتباس (حب، حكمة، نجاح، إلخ)"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    quotes: z.array(z.object({
      text: z.string(),
      author: z.string(),
      book: z.string(),
    })),
    source: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { bookName, authorName, topic } = context;
    
    logger?.info("💬 [getBookQuotes] البحث عن اقتباسات:", { bookName, authorName, topic });
    
    const allQuotes = [
      {
        text: "إن أردت أن تعرف أخلاق رجل فضع السلطة في يده ثم انظر كيف يتصرف.",
        author: "أبراهام لينكولن",
        book: "أقوال مأثورة",
        topics: ["حكمة", "أخلاق", "سلطة"],
      },
      {
        text: "الكتب هي الثروة الثمينة للدنيا والميراث الأثمن للأجيال.",
        author: "هنري ديفيد ثورو",
        book: "أقوال عن القراءة",
        topics: ["كتب", "قراءة", "حكمة"],
      },
      {
        text: "من لم يمت بالسيف مات بغيره، تعددت الأسباب والموت واحد.",
        author: "أبو الطيب المتنبي",
        book: "ديوان المتنبي",
        topics: ["حكمة", "موت", "شعر"],
      },
      {
        text: "ليس من الضروري أن يكون كلامي مقبولاً، ولكن من الضروري أن يكون صادقاً.",
        author: "جبران خليل جبران",
        book: "النبي",
        topics: ["صدق", "حكمة", "فلسفة"],
      },
      {
        text: "الحب لا يعرف حدوداً، يتخطى العقل والمنطق، يسمو فوق كل الظروف.",
        author: "جبران خليل جبران",
        book: "الأجنحة المتكسرة",
        topics: ["حب", "رومانسية"],
      },
      {
        text: "إن الحياة موقف، فإما أن تقفه بطلاً أو تسقط جباناً.",
        author: "غسان كنفاني",
        book: "أقوال مأثورة",
        topics: ["شجاعة", "حياة", "بطولة"],
      },
      {
        text: "الوطن ليس مكاناً على الخريطة، الوطن هو ذلك الإحساس الذي يسكننا.",
        author: "غسان كنفاني",
        book: "عائد إلى حيفا",
        topics: ["وطن", "هوية", "فلسطين"],
      },
      {
        text: "المرأة في حياتنا هي كل شيء، أم وأخت وابنة وزوجة وحبيبة.",
        author: "نجيب محفوظ",
        book: "ثلاثية القاهرة",
        topics: ["مرأة", "حب", "عائلة"],
      },
      {
        text: "الحلم لا يموت أبداً، فقط النائمون هم من يموتون.",
        author: "نجيب محفوظ",
        book: "أقوال مأثورة",
        topics: ["حلم", "أمل", "إلهام"],
      },
      {
        text: "أنا لا أكتب لأعيش، أنا أعيش لأكتب.",
        author: "أحلام مستغانمي",
        book: "ذاكرة الجسد",
        topics: ["كتابة", "إبداع", "حياة"],
      },
      {
        text: "الحب الحقيقي يبدأ حين لا ننتظر شيئاً في المقابل.",
        author: "أحلام مستغانمي",
        book: "الأسود يليق بك",
        topics: ["حب", "رومانسية"],
      },
      {
        text: "العلم نور والجهل ظلام.",
        author: "مثل عربي",
        book: "أمثال عربية",
        topics: ["علم", "حكمة", "تعليم"],
      },
      {
        text: "من جد وجد، ومن زرع حصد.",
        author: "مثل عربي",
        book: "أمثال عربية",
        topics: ["عمل", "نجاح", "اجتهاد"],
      },
      {
        text: "الصبر مفتاح الفرج.",
        author: "مثل عربي",
        book: "أمثال عربية",
        topics: ["صبر", "حكمة", "أمل"],
      },
      {
        text: "إذا أردت أن تفهم الحاضر، فادرس الماضي.",
        author: "طه حسين",
        book: "الأيام",
        topics: ["تاريخ", "حكمة", "فهم"],
      },
    ];
    
    let filteredQuotes = allQuotes;
    
    if (authorName) {
      const normalizedAuthor = authorName.toLowerCase();
      filteredQuotes = allQuotes.filter(q => 
        q.author.toLowerCase().includes(normalizedAuthor)
      );
    }
    
    if (bookName) {
      const normalizedBook = bookName.toLowerCase();
      filteredQuotes = filteredQuotes.filter(q => 
        q.book.toLowerCase().includes(normalizedBook)
      );
    }
    
    if (topic) {
      const normalizedTopic = topic.toLowerCase();
      filteredQuotes = filteredQuotes.filter(q => 
        q.topics.some(t => t.toLowerCase().includes(normalizedTopic))
      );
    }
    
    if (filteredQuotes.length === 0) {
      filteredQuotes = allQuotes.slice(0, 5);
    }
    
    const quotes = filteredQuotes.slice(0, 5).map(q => ({
      text: q.text,
      author: q.author,
      book: q.book,
    }));
    
    logger?.info("✅ [getBookQuotes] تم العثور على اقتباسات:", { count: quotes.length });
    
    return {
      found: quotes.length > 0,
      quotes,
      source: bookName || authorName || topic || "اقتباسات عامة",
    };
  },
});
