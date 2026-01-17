import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getAuthorInfoTool = createTool({
  id: "get_author_info",
  description: "البحث عن معلومات عن مؤلف أو كاتب. استخدم هذه الأداة عندما يسأل المستخدم عن معلومات مؤلف معين.",
  inputSchema: z.object({
    authorName: z.string().describe("اسم المؤلف أو الكاتب"),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    author: z.object({
      name: z.string(),
      biography: z.string(),
      nationality: z.string(),
      birthYear: z.string(),
      deathYear: z.string().optional(),
      famousWorks: z.array(z.string()),
      literaryStyle: z.string(),
    }).optional(),
    searchQuery: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { authorName } = context;
    
    logger?.info("🔍 [getAuthorInfo] البحث عن معلومات المؤلف:", { authorName });
    
    const searchQuery = `معلومات عن الكاتب ${authorName} سيرة ذاتية`;
    
    const knownAuthors: Record<string, any> = {
      "نجيب محفوظ": {
        name: "نجيب محفوظ",
        biography: "روائي مصري حائز على جائزة نوبل في الأدب عام 1988، يعتبر من أعظم الكتاب العرب في القرن العشرين.",
        nationality: "مصري",
        birthYear: "1911",
        deathYear: "2006",
        famousWorks: ["الثلاثية (بين القصرين، قصر الشوق، السكرية)", "أولاد حارتنا", "زقاق المدق", "اللص والكلاب"],
        literaryStyle: "الواقعية الاجتماعية والرمزية",
      },
      "غسان كنفاني": {
        name: "غسان كنفاني",
        biography: "كاتب وروائي فلسطيني، من أبرز أدباء المقاومة الفلسطينية.",
        nationality: "فلسطيني",
        birthYear: "1936",
        deathYear: "1972",
        famousWorks: ["رجال في الشمس", "عائد إلى حيفا", "أم سعد", "أرض البرتقال الحزين"],
        literaryStyle: "أدب المقاومة والواقعية",
      },
      "جبران خليل جبران": {
        name: "جبران خليل جبران",
        biography: "شاعر وكاتب ورسام لبناني، من رواد الأدب العربي الحديث.",
        nationality: "لبناني",
        birthYear: "1883",
        deathYear: "1931",
        famousWorks: ["النبي", "الأجنحة المتكسرة", "الأرواح المتمردة", "دمعة وابتسامة"],
        literaryStyle: "الرومانسية والفلسفة الروحانية",
      },
      "طه حسين": {
        name: "طه حسين",
        biography: "أديب ومفكر مصري، لقب بعميد الأدب العربي.",
        nationality: "مصري",
        birthYear: "1889",
        deathYear: "1973",
        famousWorks: ["الأيام", "دعاء الكروان", "في الشعر الجاهلي", "على هامش السيرة"],
        literaryStyle: "النقد الأدبي والسيرة الذاتية",
      },
      "أحلام مستغانمي": {
        name: "أحلام مستغانمي",
        biography: "روائية وشاعرة جزائرية، من أشهر الكاتبات العربيات المعاصرات.",
        nationality: "جزائرية",
        birthYear: "1953",
        famousWorks: ["ذاكرة الجسد", "فوضى الحواس", "عابر سرير", "نسيان.com"],
        literaryStyle: "الرومانسية الحديثة",
      },
    };
    
    const normalizedName = authorName.trim();
    let foundAuthor = null;
    
    for (const [key, value] of Object.entries(knownAuthors)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        foundAuthor = value;
        break;
      }
    }
    
    if (foundAuthor) {
      logger?.info("✅ [getAuthorInfo] تم العثور على معلومات المؤلف:", { name: foundAuthor.name });
      return {
        found: true,
        author: foundAuthor,
        searchQuery,
      };
    }
    
    logger?.info("❌ [getAuthorInfo] لم يتم العثور على معلومات المؤلف:", { authorName });
    return {
      found: false,
      searchQuery,
    };
  },
});
