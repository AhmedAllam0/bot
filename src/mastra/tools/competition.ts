import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool as pool } from "../db/pool";

const TITLES = [
  { id: 1, name: "مبتدئ", min_points: 0, emoji: "📖", description: "في بداية رحلة المعرفة", reward: null },
  { id: 2, name: "قارئ", min_points: 100, emoji: "📚", description: "بدأت تتذوق حلاوة القراءة", reward: null },
  { id: 3, name: "مثقف", min_points: 300, emoji: "🎓", description: "تنمو معرفتك يوماً بعد يوم", reward: "شهادة رقمية" },
  { id: 4, name: "أديب", min_points: 600, emoji: "✍️", description: "أصبحت من عشاق الأدب", reward: null },
  { id: 5, name: "عالم", min_points: 1000, emoji: "🏛️", description: "اتسعت آفاقك المعرفية", reward: "Canva Pro أسبوع" },
  { id: 6, name: "حكيم", min_points: 1500, emoji: "🦉", description: "الحكمة تسكن قلبك", reward: null },
  { id: 7, name: "فيلسوف", min_points: 2500, emoji: "🌟", description: "تفكيرك عميق كالمحيط", reward: "Canva Pro شهر" },
  { id: 8, name: "أسطورة", min_points: 4000, emoji: "👑", description: "أنت قمة في الثقافة", reward: null },
  { id: 9, name: "عبقري", min_points: 6000, emoji: "🧠", description: "عقل استثنائي!", reward: "Canva Pro 3 شهور" },
  { id: 10, name: "خالد", min_points: 10000, emoji: "⭐", description: "اسمك محفور في سجل العظماء", reward: "مكافأة خاصة" },
];

const MOTIVATIONAL_MESSAGES = {
  correct: [
    "أحسنت! عقلك يتوهج بالمعرفة! 🌟",
    "رائع! أنت نجم ساطع في سماء الثقافة! ⭐",
    "ممتاز! استمر، أنت على الطريق الصحيح! 🚀",
    "بارك الله فيك! إجابة صحيحة! ✨",
    "عظيم! معرفتك تثير الإعجاب! 👏",
    "مذهل! أنت موسوعة متنقلة! 📖",
    "تبارك الله! ذاكرة قوية ومعلومات غنية! 🎯",
  ],
  incorrect: [
    "لا بأس، المحاولة شجاعة! حاول مرة أخرى 💪",
    "كل خطأ هو فرصة للتعلم! 📚",
    "لا تيأس، العظماء يتعلمون من أخطائهم! 🌱",
    "المعرفة رحلة، وأنت على الطريق! 🛤️",
    "الفشل أول خطوة نحو النجاح! ⭐",
  ],
  streak: {
    3: "🔥 سلسلة رائعة! 3 إجابات صحيحة متتالية!",
    5: "🔥🔥 خمسة على التوالي! أنت على نار!",
    10: "🔥🔥🔥 عشرة متتالية! أنت عبقري!",
    15: "🌟🔥 15 إجابة صحيحة! لا يوقفك شيء!",
    20: "👑🔥 20 متتالية! أنت أسطورة حية!",
  },
  milestones: {
    10: "🎉 أكملت 10 أسئلة! بداية موفقة!",
    25: "🎊 25 سؤال! أنت تتقدم بثبات!",
    50: "🏆 نصف مئة سؤال! إنجاز رائع!",
    100: "💯 مئة سؤال! أنت بطل حقيقي!",
    200: "🌟 200 سؤال! مستوى استثنائي!",
  },
  titleUp: [
    "🎉 تهانينا! لقد ترقيت إلى لقب جديد!",
    "🏅 إنجاز عظيم! لقب جديد يضاف لرصيدك!",
    "⬆️ مبروك الترقية! أنت تصعد نحو القمة!",
  ],
  encouragement: [
    "💡 هل تعلم؟ القراءة تغذي العقل كما يغذي الطعام الجسد!",
    "📖 الكتاب خير جليس في الزمان!",
    "🌟 المعرفة كنز لا يفنى!",
    "💪 كل سؤال تجيب عليه يقربك من القمة!",
  ],
};

function getRandomMessage(category: keyof typeof MOTIVATIONAL_MESSAGES): string {
  const messages = MOTIVATIONAL_MESSAGES[category];
  if (Array.isArray(messages)) {
    return messages[Math.floor(Math.random() * messages.length)];
  }
  return "";
}

function getStreakMessage(streak: number): string | null {
  const streakMilestones = [20, 15, 10, 5, 3];
  for (const milestone of streakMilestones) {
    if (streak >= milestone && streak % milestone === 0) {
      return MOTIVATIONAL_MESSAGES.streak[milestone as keyof typeof MOTIVATIONAL_MESSAGES.streak];
    }
  }
  if (streak === 3 || streak === 5 || streak === 10 || streak === 15 || streak === 20) {
    return MOTIVATIONAL_MESSAGES.streak[streak as keyof typeof MOTIVATIONAL_MESSAGES.streak];
  }
  return null;
}

function getMilestoneMessage(totalAnswers: number): string | null {
  const milestones = [200, 100, 50, 25, 10];
  for (const milestone of milestones) {
    if (totalAnswers === milestone) {
      return MOTIVATIONAL_MESSAGES.milestones[milestone as keyof typeof MOTIVATIONAL_MESSAGES.milestones];
    }
  }
  return null;
}

function getTitleForPoints(points: number) {
  for (let i = TITLES.length - 1; i >= 0; i--) {
    if (points >= TITLES[i].min_points) {
      return TITLES[i];
    }
  }
  return TITLES[0];
}

function getNextTitle(currentPoints: number) {
  for (const title of TITLES) {
    if (title.min_points > currentPoints) {
      return { title, pointsNeeded: title.min_points - currentPoints };
    }
  }
  return null;
}

export const getRandomQuestion = createTool({
  id: "get-random-question",
  description: "يجلب سؤال عشوائي من بنك الأسئلة الثقافية للمسابقة. يحفظ السؤال في جلسة المستخدم للإجابة عليه لاحقاً.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام (مطلوب)"),
    category: z.string().optional().describe("تصنيف السؤال (أدب عربي، أدب عالمي)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    question: z.object({
      id: z.number(),
      question: z.string(),
      options: z.object({
        A: z.string(),
        B: z.string(),
        C: z.string(),
        D: z.string(),
      }),
      category: z.string(),
      difficulty: z.string(),
      points: z.number(),
    }).optional(),
    message: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🎯 [Competition] جاري جلب سؤال عشوائي للمستخدم:", context.telegramId);
    
    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [Competition] DATABASE_URL غير موجود");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }
    
    try {
      let query = `
        SELECT id, question, option_a, option_b, option_c, option_d, 
               category, difficulty, points
        FROM competition_questions
        WHERE id NOT IN (
          SELECT question_id FROM user_answers 
          WHERE user_id = (SELECT id FROM competition_users WHERE telegram_id = $1)
        )
        ORDER BY RANDOM() LIMIT 1
      `;
      
      const result = await pool.query(query, [context.telegramId]);
      
      if (result.rows.length === 0) {
        const allQuestionsResult = await pool.query(
          "SELECT id, question, option_a, option_b, option_c, option_d, category, difficulty, points FROM competition_questions ORDER BY RANDOM() LIMIT 1"
        );
        
        if (allQuestionsResult.rows.length === 0) {
          return { success: false, message: "لا توجد أسئلة متاحة حالياً." };
        }
        
        const q = allQuestionsResult.rows[0];
        
        await pool.query(
          `INSERT INTO user_sessions (telegram_id, last_question_id, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (telegram_id) DO UPDATE SET last_question_id = $2, updated_at = NOW()`,
          [context.telegramId, q.id]
        );
        
        return {
          success: true,
          question: {
            id: q.id,
            question: q.question,
            options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
            category: q.category,
            difficulty: q.difficulty,
            points: q.points,
          },
          message: "هذا سؤال سبق أن أجبت عليه، لكن يمكنك المحاولة مجدداً!",
        };
      }
      
      const q = result.rows[0];
      
      await pool.query(
        `INSERT INTO user_sessions (telegram_id, last_question_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (telegram_id) DO UPDATE SET last_question_id = $2, updated_at = NOW()`,
        [context.telegramId, q.id]
      );
      
      logger?.info("✅ [Competition] تم جلب السؤال:", q.id);
      
      return {
        success: true,
        question: {
          id: q.id,
          question: q.question,
          options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
          category: q.category,
          difficulty: q.difficulty,
          points: q.points,
        },
      };
    } catch (error) {
      logger?.error("❌ [Competition] خطأ:", error);
      return { success: false, message: "حدث خطأ في جلب السؤال" };
    }
  },
});

export const answerQuestion = createTool({
  id: "answer-question",
  description: "يسجل إجابة المستخدم على سؤال المسابقة ويحسب النقاط. إذا لم يتم تحديد questionId، يستخدم آخر سؤال تم طرحه على المستخدم.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام (مطلوب)"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
    questionId: z.number().optional().describe("معرف السؤال (اختياري - يستخدم آخر سؤال إذا لم يُحدد)"),
    answer: z.enum(["A", "B", "C", "D", "a", "b", "c", "d"]).describe("إجابة المستخدم"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    isCorrect: z.boolean().optional(),
    correctAnswer: z.string().optional(),
    pointsEarned: z.number().optional(),
    totalPoints: z.number().optional(),
    newTitle: z.string().optional(),
    titleEmoji: z.string().optional(),
    streak: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📝 [Competition] تسجيل إجابة من:", context.telegramId);
    
    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }
    
    try {
      let questionId = context.questionId;
      
      if (!questionId) {
        const sessionResult = await pool.query(
          "SELECT last_question_id FROM user_sessions WHERE telegram_id = $1",
          [context.telegramId]
        );
        
        if (sessionResult.rows.length === 0 || !sessionResult.rows[0].last_question_id) {
          return {
            success: false,
            message: "لم تطلب سؤالاً بعد! أرسل 'سؤال' للحصول على سؤال أولاً.",
          };
        }
        
        questionId = sessionResult.rows[0].last_question_id;
        logger?.info("📝 [Competition] استخدام آخر سؤال من الجلسة:", questionId);
      }
      
      let userResult = await pool.query(
        "SELECT * FROM competition_users WHERE telegram_id = $1",
        [context.telegramId]
      );
      
      if (userResult.rows.length === 0) {
        const referralCode = `ref_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        await pool.query(
          `INSERT INTO competition_users (telegram_id, username, first_name, total_points, title_id, referral_code, daily_streak)
           VALUES ($1, $2, $3, 0, 1, $4, 0)`,
          [context.telegramId, context.username || null, context.firstName || null, referralCode]
        );
        userResult = await pool.query(
          "SELECT * FROM competition_users WHERE telegram_id = $1",
          [context.telegramId]
        );
      } else {
        // تحديث اسم المستخدم إذا تغير (ليس unknown أو مستخدم)
        const currentUser = userResult.rows[0];
        const shouldUpdate = (context.firstName && context.firstName !== currentUser.first_name && context.firstName !== "مستخدم") ||
                            (context.username && context.username !== currentUser.username && context.username !== "unknown");
        
        if (shouldUpdate) {
          await pool.query(
            `UPDATE competition_users SET 
             username = COALESCE(NULLIF($1, 'unknown'), username),
             first_name = COALESCE(NULLIF($2, 'مستخدم'), first_name)
             WHERE telegram_id = $3`,
            [context.username || null, context.firstName || null, context.telegramId]
          );
        }
      }
      
      const user = userResult.rows[0];
      
      const existingAnswer = await pool.query(
        "SELECT * FROM user_answers WHERE user_id = $1 AND question_id = $2",
        [user.id, questionId]
      );
      
      if (existingAnswer.rows.length > 0) {
        return {
          success: false,
          message: "لقد أجبت على هذا السؤال من قبل! أرسل 'سؤال' للحصول على سؤال جديد.",
        };
      }
      
      const questionResult = await pool.query(
        "SELECT * FROM competition_questions WHERE id = $1",
        [questionId]
      );
      
      if (questionResult.rows.length === 0) {
        return {
          success: false,
          message: "السؤال غير موجود. أرسل 'سؤال' للحصول على سؤال جديد.",
        };
      }
      
      const question = questionResult.rows[0];
      const isCorrect = context.answer.toUpperCase() === question.correct_answer.toUpperCase();
      const pointsEarned = isCorrect ? question.points : 0;
      
      await pool.query(
        `INSERT INTO user_answers (user_id, question_id, answer, is_correct, points_earned)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, questionId, context.answer.toUpperCase(), isCorrect, pointsEarned]
      );
      
      await pool.query(
        "UPDATE user_sessions SET last_question_id = NULL WHERE telegram_id = $1",
        [context.telegramId]
      );
      
      let newStreak = isCorrect ? user.current_streak + 1 : 0;
      let bestStreak = Math.max(user.best_streak, newStreak);
      let streakBonus = 0;
      
      if (newStreak >= 5) streakBonus = 5;
      if (newStreak >= 10) streakBonus = 10;
      
      const newTotalPoints = user.total_points + pointsEarned + streakBonus;
      const newTitle = getTitleForPoints(newTotalPoints);
      
      await pool.query(
        `UPDATE competition_users 
         SET total_points = $1, 
             correct_answers = correct_answers + $2,
             wrong_answers = wrong_answers + $3,
             current_streak = $4,
             best_streak = $5,
             title_id = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [
          newTotalPoints,
          isCorrect ? 1 : 0,
          isCorrect ? 0 : 1,
          newStreak,
          bestStreak,
          newTitle.id,
          user.id
        ]
      );
      
      const correctOptions: Record<string, string> = {
        A: question.option_a,
        B: question.option_b,
        C: question.option_c,
        D: question.option_d,
      };
      
      const totalAnswers = user.correct_answers + user.wrong_answers + 1;
      let message = "";
      let extraMessages: string[] = [];
      
      if (isCorrect) {
        message = `✅ ${getRandomMessage('correct')}\n\n+${pointsEarned} نقطة`;
        if (streakBonus > 0) {
          message += ` (+${streakBonus} مكافأة سلسلة)`;
        }
        
        const streakMsg = getStreakMessage(newStreak);
        if (streakMsg) extraMessages.push(streakMsg);
        
        if (newTitle.id > user.title_id) {
          extraMessages.push(`${getRandomMessage('titleUp')}\n${newTitle.emoji} ${newTitle.name}: ${newTitle.description}`);
        }
      } else {
        message = `❌ ${getRandomMessage('incorrect')}\n\nالإجابة الصحيحة: ${correctOptions[question.correct_answer]}`;
      }
      
      const milestoneMsg = getMilestoneMessage(totalAnswers);
      if (milestoneMsg) extraMessages.push(milestoneMsg);
      
      if (extraMessages.length > 0) {
        message += "\n\n" + extraMessages.join("\n\n");
      }
      
      const nextTitleInfo = getNextTitle(newTotalPoints);
      if (nextTitleInfo && Math.random() < 0.3) {
        message += `\n\n💡 تبقى ${nextTitleInfo.pointsNeeded} نقطة للوصول للقب "${nextTitleInfo.title.name}" ${nextTitleInfo.title.emoji}`;
      }
      
      logger?.info("✅ [Competition] تم تسجيل الإجابة:", { isCorrect, pointsEarned });
      
      return {
        success: true,
        isCorrect,
        correctAnswer: correctOptions[question.correct_answer],
        pointsEarned: pointsEarned + streakBonus,
        totalPoints: newTotalPoints,
        newTitle: newTitle.name,
        titleEmoji: newTitle.emoji,
        streak: newStreak,
        message,
      };
    } catch (error) {
      logger?.error("❌ [Competition] خطأ:", error);
      return {
        success: false,
        message: "حدث خطأ في تسجيل الإجابة",
      };
    }
  },
});

export const getUserStats = createTool({
  id: "get-user-stats",
  description: "يجلب إحصائيات وترتيب المستخدم في المسابقة",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      totalPoints: z.number(),
      correctAnswers: z.number(),
      wrongAnswers: z.number(),
      accuracy: z.number(),
      currentStreak: z.number(),
      bestStreak: z.number(),
      title: z.string(),
      titleEmoji: z.string(),
      titleDescription: z.string().optional(),
      rank: z.number(),
      nextTitle: z.string().optional(),
      pointsToNextTitle: z.number().optional(),
      progressBar: z.string().optional(),
      encouragement: z.string().optional(),
    }).optional(),
    message: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [Competition] جلب إحصائيات:", context.telegramId);
    
    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [Competition] DATABASE_URL غير موجود");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }
    
    try {
      const userResult = await pool.query(
        "SELECT * FROM competition_users WHERE telegram_id = $1",
        [context.telegramId]
      );
      
      if (userResult.rows.length === 0) {
        return {
          success: false,
          message: "لم تشارك في أي مسابقة بعد! أرسل 'سؤال' للبدء.",
        };
      }
      
      const user = userResult.rows[0];
      
      const rankResult = await pool.query(
        `SELECT COUNT(*) + 1 as rank 
         FROM competition_users 
         WHERE total_points > $1`,
        [user.total_points]
      );
      
      const rank = parseInt(rankResult.rows[0].rank);
      const title = getTitleForPoints(user.total_points);
      const nextTitleInfo = getNextTitle(user.total_points);
      
      const totalAnswers = user.correct_answers + user.wrong_answers;
      const accuracy = totalAnswers > 0 
        ? Math.round((user.correct_answers / totalAnswers) * 100) 
        : 0;
      
      logger?.info("✅ [Competition] تم جلب الإحصائيات");
      
      let encouragement = getRandomMessage('encouragement');
      let progressBar = "";
      if (nextTitleInfo) {
        const currentTitle = getTitleForPoints(user.total_points);
        const pointsInCurrentLevel = user.total_points - currentTitle.min_points;
        const pointsNeededForNext = nextTitleInfo.title.min_points - currentTitle.min_points;
        const progress = Math.round((pointsInCurrentLevel / pointsNeededForNext) * 10);
        progressBar = "▓".repeat(progress) + "░".repeat(10 - progress);
      }
      
      return {
        success: true,
        stats: {
          totalPoints: user.total_points,
          correctAnswers: user.correct_answers,
          wrongAnswers: user.wrong_answers,
          accuracy,
          currentStreak: user.current_streak,
          bestStreak: user.best_streak,
          title: title.name,
          titleEmoji: title.emoji,
          titleDescription: title.description,
          rank,
          nextTitle: nextTitleInfo?.title.name,
          pointsToNextTitle: nextTitleInfo?.pointsNeeded,
          progressBar,
          encouragement,
        },
      };
    } catch (error) {
      logger?.error("❌ [Competition] خطأ:", error);
      return {
        success: false,
        message: "حدث خطأ في جلب الإحصائيات",
      };
    }
  },
});

export const getLeaderboard = createTool({
  id: "get-leaderboard",
  description: "يجلب قائمة المتصدرين في المسابقة",
  inputSchema: z.object({
    limit: z.number().optional().default(10).describe("عدد المتصدرين"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    leaderboard: z.array(z.object({
      rank: z.number(),
      name: z.string(),
      points: z.number(),
      title: z.string(),
      titleEmoji: z.string(),
    })).optional(),
    message: z.string().optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🏆 [Competition] جلب المتصدرين");
    
    if (!process.env.DATABASE_URL) {
      logger?.error("❌ [Competition] DATABASE_URL غير موجود");
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }
    
    try {
      const result = await pool.query(
        `SELECT telegram_id, username, first_name, total_points, title_id
         FROM competition_users
         WHERE telegram_id != 777000
         ORDER BY total_points DESC
         LIMIT $1`,
        [context.limit || 10]
      );
      
      const leaderboard = result.rows.map((user, index) => {
        const title = getTitleForPoints(user.total_points);
        return {
          rank: index + 1,
          name: user.first_name || user.username || `مستخدم ${user.telegram_id}`,
          points: user.total_points,
          title: title.name,
          titleEmoji: title.emoji,
        };
      });
      
      logger?.info("✅ [Competition] تم جلب المتصدرين:", leaderboard.length);
      
      return {
        success: true,
        leaderboard,
      };
    } catch (error) {
      logger?.error("❌ [Competition] خطأ:", error);
      return {
        success: false,
        message: "حدث خطأ في جلب المتصدرين",
      };
    }
  },
});

export const formatQuestionMessage = (question: {
  id: number;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  category: string;
  difficulty: string;
  points: number;
}): string => {
  const difficultyEmoji = question.difficulty === 'سهل' ? '🟢' : 
                          question.difficulty === 'متوسط' ? '🟡' : '🔴';
  
  return `<b>🎯 سؤال المسابقة #${question.id}</b>

<i>${question.question}</i>

<b>A)</b> ${question.options.A}
<b>B)</b> ${question.options.B}
<b>C)</b> ${question.options.C}
<b>D)</b> ${question.options.D}

━━━━━━━━━━━━━━━
📚 <b>التصنيف:</b> ${question.category}
${difficultyEmoji} <b>الصعوبة:</b> ${question.difficulty}
⭐ <b>النقاط:</b> ${question.points}
━━━━━━━━━━━━━━━

📝 أرسل حرف الإجابة (<code>A</code> أو <code>B</code> أو <code>C</code> أو <code>D</code>)`;
};

export const formatStatsMessage = (stats: {
  totalPoints: number;
  correctAnswers: number;
  wrongAnswers: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  title: string;
  titleEmoji: string;
  titleDescription?: string;
  rank: number;
  nextTitle?: string;
  pointsToNextTitle?: number;
  progressBar?: string;
  encouragement?: string;
}): string => {
  let message = `<b>📊 إحصائياتك في المسابقة</b>

━━━━━━━━━━━━━━━
${stats.titleEmoji} <b>اللقب:</b> ${stats.title}`;

  if (stats.titleDescription) {
    message += `\n<i>${stats.titleDescription}</i>`;
  }

  message += `

🏆 <b>الترتيب:</b> #${stats.rank}
⭐ <b>النقاط:</b> ${stats.totalPoints}
━━━━━━━━━━━━━━━

✅ إجابات صحيحة: <b>${stats.correctAnswers}</b>
❌ إجابات خاطئة: <b>${stats.wrongAnswers}</b>
📈 نسبة النجاح: <b>${stats.accuracy}%</b>

🔥 السلسلة الحالية: <b>${stats.currentStreak}</b>
🏅 أفضل سلسلة: <b>${stats.bestStreak}</b>`;

  if (stats.nextTitle && stats.pointsToNextTitle) {
    message += `\n\n━━━━━━━━━━━━━━━\n📌 <b>اللقب التالي:</b> ${stats.nextTitle}`;
    if (stats.progressBar) {
      message += `\n<code>[${stats.progressBar}]</code> ${stats.pointsToNextTitle} نقطة متبقية`;
    } else {
      message += `\nتحتاج <b>${stats.pointsToNextTitle}</b> نقطة`;
    }
  }
  
  if (stats.encouragement) {
    message += `\n\n💬 <i>${stats.encouragement}</i>`;
  }
  
  return message;
};

export const formatLeaderboardMessage = (leaderboard: {
  rank: number;
  name: string;
  points: number;
  title: string;
  titleEmoji: string;
}[]): string => {
  if (leaderboard.length === 0) {
    return "<b>🏆 قائمة المتصدرين</b>\n\n<i>لا يوجد متسابقون بعد! كن أول المشاركين.</i>";
  }
  
  const medals = ["🥇", "🥈", "🥉"];
  
  let message = "<b>🏆 قائمة المتصدرين</b>\n━━━━━━━━━━━━━━━\n\n";
  
  leaderboard.forEach((user, index) => {
    const medal = index < 3 ? medals[index] : `<b>${index + 1}.</b>`;
    message += `${medal} ${user.titleEmoji} <b>${user.name}</b>\n     ⭐ ${user.points} نقطة | <i>${user.title}</i>\n\n`;
  });
  
  message += "━━━━━━━━━━━━━━━\n📝 أرسل <code>سؤال</code> للمشاركة!";
  
  return message;
};
