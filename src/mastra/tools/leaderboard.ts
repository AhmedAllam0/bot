import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool } from "../db/pool";

export const getLeaderboard = createTool({
  id: "get_leaderboard",
  description: "الحصول على قائمة المتصدرين (أعلى المستخدمين نقاطاً)",
  inputSchema: z.object({
    limit: z.number().optional().default(10).describe("عدد المستخدمين"),
    includeUserRank: z.boolean().optional().default(false).describe("تضمين ترتيب المستخدم الحالي"),
    userId: z.number().optional().describe("معرف المستخدم للحصول على ترتيبه"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    leaderboard: z.array(z.object({
      rank: z.number(),
      firstName: z.string(),
      username: z.string().optional(),
      totalPoints: z.number(),
      title: z.string(),
      dailyStreak: z.number(),
    })),
    userRank: z.object({
      rank: z.number(),
      totalPoints: z.number(),
      title: z.string(),
    }).optional(),
    totalUsers: z.number(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { limit, includeUserRank, userId } = context;
    
    logger?.info("🏆 [Leaderboard] جلب قائمة المتصدرين");
    
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
    
    const getTitleName = (titleId: number) => {
      return titles.find(t => t.id === titleId)?.name || "📖 مبتدئ";
    };
    
    try {
      const result = await sharedPool.query(`
        SELECT 
          first_name, 
          username, 
          total_points, 
          title_id, 
          daily_streak,
          ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank
        FROM competition_users
        WHERE total_points > 0
        ORDER BY total_points DESC
        LIMIT $1
      `, [limit || 10]);
      
      const leaderboard = result.rows.map((row: any) => ({
        rank: parseInt(row.rank),
        firstName: row.first_name || "مستخدم",
        username: row.username,
        totalPoints: row.total_points || 0,
        title: getTitleName(row.title_id || 1),
        dailyStreak: row.daily_streak || 0,
      }));
      
      const totalResult = await sharedPool.query(`
        SELECT COUNT(*) as total FROM competition_users WHERE total_points > 0
      `);
      const totalUsers = parseInt(totalResult.rows[0]?.total || "0");
      
      let userRank;
      if (includeUserRank && userId) {
        const userResult = await sharedPool.query(`
          SELECT 
            total_points, 
            title_id,
            (SELECT COUNT(*) + 1 FROM competition_users WHERE total_points > cu.total_points) as rank
          FROM competition_users cu
          WHERE telegram_id = $1
        `, [userId]);
        
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          userRank = {
            rank: parseInt(user.rank),
            totalPoints: user.total_points || 0,
            title: getTitleName(user.title_id || 1),
          };
        }
      }
      
      logger?.info("✅ [Leaderboard] تم جلب المتصدرين:", { count: leaderboard.length });
      
      return { success: true, leaderboard, userRank, totalUsers };
    } catch (error: any) {
      logger?.error("❌ [Leaderboard] خطأ:", error);
      return { success: false, leaderboard: [], totalUsers: 0 };
    }
  },
});
