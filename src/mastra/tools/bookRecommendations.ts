import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getBookRecommendationsTool = createTool({
  id: "get_book_recommendations",
  description: "الحصول على توصيات كتب بناءً على النوع الأدبي أو كتاب مشابه. استخدم هذه الأداة عندما يطلب المستخدم اقتراحات أو توصيات كتب.",
  inputSchema: z.object({
    genre: z.string().optional().describe("النوع الأدبي (رواية، شعر، تاريخ، فلسفة، تنمية ذاتية، إلخ)"),
    similarTo: z.string().optional().describe("اسم كتاب للبحث عن كتب مشابهة له"),
    mood: z.string().optional().describe("المزاج أو الجو المطلوب (رومانسي، مشوق، فلسفي، ملهم، إلخ)"),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      title: z.string(),
      author: z.string(),
      description: z.string(),
      genre: z.string(),
    })),
    searchQuery: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { genre, similarTo, mood } = context;
    
    logger?.info("📚 [getBookRecommendations] بدء البحث عن توصيات:", { genre, similarTo, mood });
    
    let searchQuery = "أفضل الكتب العربية";
    if (genre) searchQuery = `أفضل كتب ${genre} عربية مقترحة`;
    if (similarTo) searchQuery = `كتب مشابهة لـ ${similarTo}`;
    if (mood) searchQuery = `كتب ${mood} عربية موصى بها`;
    
    logger?.info("📝 [getBookRecommendations] استعلام البحث:", { searchQuery });
    
    const recommendations = [
      {
        title: "ألف ليلة وليلة",
        author: "مجهول",
        description: "مجموعة قصص شعبية عربية كلاسيكية مليئة بالمغامرات والخيال",
        genre: "أدب كلاسيكي",
      },
      {
        title: "رجال في الشمس",
        author: "غسان كنفاني",
        description: "رواية فلسطينية مؤثرة عن معاناة اللجوء والبحث عن الأمل",
        genre: "رواية",
      },
      {
        title: "موسم الهجرة إلى الشمال",
        author: "الطيب صالح",
        description: "رواية سودانية عن صراع الهوية بين الشرق والغرب",
        genre: "رواية",
      },
      {
        title: "الأجنحة المتكسرة",
        author: "جبران خليل جبران",
        description: "قصة حب رومانسية فلسفية مؤثرة",
        genre: "رومانسي",
      },
      {
        title: "ثلاثية غرناطة",
        author: "رضوى عاشور",
        description: "ملحمة تاريخية عن سقوط الأندلس ومصير العرب فيها",
        genre: "تاريخي",
      },
    ];
    
    let filteredRecommendations = recommendations;
    if (genre) {
      const genreLower = genre.toLowerCase();
      filteredRecommendations = recommendations.filter(r => 
        r.genre.toLowerCase().includes(genreLower) || 
        r.description.toLowerCase().includes(genreLower)
      );
      if (filteredRecommendations.length === 0) {
        filteredRecommendations = recommendations.slice(0, 3);
      }
    }
    
    logger?.info("✅ [getBookRecommendations] تم العثور على توصيات:", { count: filteredRecommendations.length });
    
    return {
      recommendations: filteredRecommendations,
      searchQuery,
    };
  },
});
