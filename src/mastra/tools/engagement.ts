import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sharedPool as pool } from "../db/pool";

const GROUP_ID = "-1002129652576";
const DAILY_GROUP_POINTS_LIMIT = 20;
const POINTS_PER_MESSAGE = 2;
const DAILY_CHECKIN_POINTS = 5;
const STREAK_7_BONUS = 20;
const STREAK_30_BONUS = 100;
const REFERRER_POINTS = 50;
const REFEREE_POINTS = 25;
const ADMIN_CHAT_ID = "-1002139582646";

const TITLE_REWARDS = [
  { name: "مثقف", min_points: 300, reward: "شهادة رقمية" },
  { name: "عالم", min_points: 1000, reward: "Canva Pro أسبوع" },
  { name: "فيلسوف", min_points: 2500, reward: "Canva Pro شهر" },
  { name: "عبقري", min_points: 6000, reward: "Canva Pro 3 شهور" },
  { name: "خالد", min_points: 10000, reward: "مكافأة خاصة" },
];

function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "ref_";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function ensureUserExists(telegramId: number, username?: string, firstName?: string): Promise<number> {
  let userResult = await pool.query(
    "SELECT id, username, first_name FROM competition_users WHERE telegram_id = $1",
    [telegramId]
  );

  if (userResult.rows.length === 0) {
    const referralCode = generateReferralCode();
    await pool.query(
      `INSERT INTO competition_users (telegram_id, username, first_name, total_points, title_id, referral_code, daily_streak)
       VALUES ($1, $2, $3, 0, 1, $4, 0)`,
      [telegramId, username || null, firstName || null, referralCode]
    );
    userResult = await pool.query(
      "SELECT id FROM competition_users WHERE telegram_id = $1",
      [telegramId]
    );
  } else {
    // تحديث اسم المستخدم إذا تغير
    const currentUser = userResult.rows[0];
    const shouldUpdate = (firstName && firstName !== currentUser.first_name && firstName !== "مستخدم") ||
                        (username && username !== currentUser.username && username !== "unknown");
    
    if (shouldUpdate) {
      await pool.query(
        `UPDATE competition_users SET 
         username = COALESCE($1, username),
         first_name = COALESCE($2, first_name)
         WHERE telegram_id = $3`,
        [username && username !== "unknown" ? username : null, 
         firstName && firstName !== "مستخدم" ? firstName : null, 
         telegramId]
      );
    }
  }

  return userResult.rows[0].id;
}

export const awardGroupActivityPoints = createTool({
  id: "award-group-activity-points",
  description: "يمنح نقاط للمستخدم عند إرسال رسائل في الجروب. +2 نقطة لكل رسالة بحد أقصى 20 نقطة يومياً.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    chatId: z.string().describe("معرف المحادثة/الجروب"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    pointsAwarded: z.number().optional(),
    totalDailyPoints: z.number().optional(),
    remainingDailyPoints: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📊 [Engagement] تسجيل نشاط الجروب:", { telegramId: context.telegramId, chatId: context.chatId });

    if (!process.env.DATABASE_URL) {
      return { success: false, pointsAwarded: 0, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    if (context.chatId !== GROUP_ID) {
      logger?.info("📊 [Engagement] ليس الجروب المستهدف:", context.chatId);
      return { success: false, pointsAwarded: 0, message: "هذه الميزة متاحة فقط في الجروب الرسمي" };
    }

    const client = await pool.connect();
    try {
      logger?.info("📊 [Engagement] بدء معاملة للنشاط الجماعي");
      await client.query('BEGIN');

      const userId = await ensureUserExists(context.telegramId, context.username, context.firstName);
      logger?.info("✅ [Engagement] تم التحقق من وجود المستخدم:", userId);

      const today = new Date().toISOString().split('T')[0];
      logger?.info("📅 [Engagement] التاريخ الحالي:", today);

      // استخدام SELECT FOR UPDATE لقفل الصف
      let activityResult = await client.query(
        "SELECT * FROM daily_activity WHERE telegram_id = $1 AND activity_date = $2 FOR UPDATE",
        [context.telegramId, today]
      );
      logger?.info("📝 [Engagement] جلب بيانات النشاط مع القفل");

      let currentDailyPoints = 0;
      let messageCount = 0;
      let pointsAwarded = 0;

      if (activityResult.rows.length === 0) {
        logger?.info("📊 [Engagement] لا توجد بيانات نشاط اليوم، إنشاء سجل جديد");
        await client.query(
          `INSERT INTO daily_activity (user_id, telegram_id, activity_date, group_messages, group_points_earned)
           VALUES ($1, $2, $3, 1, $4)`,
          [userId, context.telegramId, today, POINTS_PER_MESSAGE]
        );
        currentDailyPoints = POINTS_PER_MESSAGE;
        messageCount = 1;
        pointsAwarded = POINTS_PER_MESSAGE;
        logger?.info("✅ [Engagement] تم إنشاء سجل جديد", { currentDailyPoints, messageCount });
      } else {
        currentDailyPoints = activityResult.rows[0].group_points_earned;
        messageCount = activityResult.rows[0].group_messages;
        logger?.info("📊 [Engagement] البيانات الحالية", { currentDailyPoints, messageCount });

        if (currentDailyPoints >= DAILY_GROUP_POINTS_LIMIT) {
          logger?.info("⚠️ [Engagement] وصل الحد اليومي");
          await client.query('COMMIT');
          return {
            success: true,
            pointsAwarded: 0,
            totalDailyPoints: currentDailyPoints,
            remainingDailyPoints: 0,
            message: "🎉 لقد وصلت للحد الأقصى اليومي (20 نقطة)! عد غداً لمزيد من النقاط.",
          };
        }

        const newPoints = Math.min(currentDailyPoints + POINTS_PER_MESSAGE, DAILY_GROUP_POINTS_LIMIT);
        pointsAwarded = newPoints - currentDailyPoints;
        logger?.info("📊 [Engagement] النقاط الجديدة المحسوبة", { newPoints, pointsAwarded });

        await client.query(
          `UPDATE daily_activity 
           SET group_messages = $1, group_points_earned = $2
           WHERE telegram_id = $3 AND activity_date = $4`,
          [messageCount + 1, newPoints, context.telegramId, today]
        );
        logger?.info("✅ [Engagement] تم تحديث بيانات النشاط اليومي");

        currentDailyPoints = newPoints;
        messageCount += 1;
      }

      // تحديث النقاط الكلية للمستخدم
      await client.query(
        `UPDATE competition_users SET total_points = total_points + $1 WHERE telegram_id = $2`,
        [pointsAwarded, context.telegramId]
      );
      logger?.info("✅ [Engagement] تم تحديث النقاط الكلية للمستخدم", { pointsAwarded });

      // تأكيد المعاملة
      await client.query('COMMIT');
      logger?.info("✅ [Engagement] تم تأكيد المعاملة بنجاح");

      const remainingPoints = DAILY_GROUP_POINTS_LIMIT - currentDailyPoints;

      return {
        success: true,
        pointsAwarded: pointsAwarded,
        totalDailyPoints: currentDailyPoints,
        remainingDailyPoints: remainingPoints,
        message: `+${pointsAwarded} نقطة! 📊 مجموع اليوم: ${currentDailyPoints}/${DAILY_GROUP_POINTS_LIMIT}`,
      };
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ في معاملة النشاط الجماعي:", error);
      try {
        await client.query('ROLLBACK');
        logger?.info("🔄 [Engagement] تم استرجاع المعاملة");
      } catch (rollbackError) {
        logger?.error("❌ [Engagement] خطأ في استرجاع المعاملة:", rollbackError);
      }
      return { success: false, pointsAwarded: 0, message: "حدث خطأ في تسجيل النشاط" };
    } finally {
      client.release();
      logger?.info("🔓 [Engagement] تم إطلاق اتصال قاعدة البيانات");
    }
  },
});

export const checkInDaily = createTool({
  id: "checkin-daily",
  description: "تسجيل الدخول اليومي للحصول على نقاط. +5 نقاط يومياً مع مكافآت إضافية للسلسلة المتتالية.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    pointsAwarded: z.number().optional(),
    currentStreak: z.number().optional(),
    bonusAwarded: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📅 [Engagement] تسجيل دخول يومي:", context.telegramId);

    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    const client = await pool.connect();
    try {
      logger?.info("📅 [Engagement] بدء معاملة تسجيل الدخول");
      await client.query('BEGIN');

      await ensureUserExists(context.telegramId, context.username, context.firstName);
      logger?.info("✅ [Engagement] تم التحقق من وجود المستخدم");

      // استخدام SELECT FOR UPDATE لقفل صف المستخدم
      const userResult = await client.query(
        "SELECT * FROM competition_users WHERE telegram_id = $1 FOR UPDATE",
        [context.telegramId]
      );
      logger?.info("🔒 [Engagement] تم قفل صف المستخدم");

      const user = userResult.rows[0];

      const today = new Date().toISOString().split('T')[0];
      const lastCheckin = user.last_checkin ? new Date(user.last_checkin).toISOString().split('T')[0] : null;
      logger?.info("📅 [Engagement] تاريخ آخر دخول:", { lastCheckin, today });

      if (lastCheckin === today) {
        logger?.info("⚠️ [Engagement] المستخدم سجل دخولاً اليوم بالفعل");
        await client.query('COMMIT');
        return {
          success: false,
          currentStreak: user.daily_streak,
          message: `✅ لقد سجلت دخولك اليوم بالفعل!
🔥 سلسلتك الحالية: <b>${user.daily_streak}</b> يوم متتالي

⏰ <b>عُد غداً</b> للحفاظ على سلسلتك والحصول على نقاط جديدة!`,
        };
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      logger?.info("📅 [Engagement] تاريخ أمس:", yesterdayStr);

      let newStreak = 1;
      if (lastCheckin === yesterdayStr) {
        newStreak = user.daily_streak + 1;
        logger?.info("🔥 [Engagement] تسلسل متواصل مستمر، الشريط الجديد:", newStreak);
      } else {
        logger?.info("🔄 [Engagement] انقطاع في التسلسل، إعادة تشغيل الشريط");
      }

      let bonusPoints = 0;
      let bonusMessage = "";

      if (newStreak === 7) {
        bonusPoints = STREAK_7_BONUS;
        bonusMessage = `\n🎉 <b>مكافأة أسبوع!</b> +${STREAK_7_BONUS} نقطة إضافية!`;
        logger?.info("🎉 [Engagement] مكافأة أسبوع!");
      } else if (newStreak === 30) {
        bonusPoints = STREAK_30_BONUS;
        bonusMessage = `\n🏆 <b>مكافأة شهر كامل!</b> +${STREAK_30_BONUS} نقطة إضافية!`;
        logger?.info("🏆 [Engagement] مكافأة شهر كامل!");
      } else if (newStreak % 30 === 0) {
        bonusPoints = STREAK_30_BONUS;
        bonusMessage = `\n🏆 <b>مكافأة ${newStreak} يوم!</b> +${STREAK_30_BONUS} نقطة إضافية!`;
        logger?.info("🏆 [Engagement] مكافأة متعددة الشهور!");
      } else if (newStreak % 7 === 0) {
        bonusPoints = STREAK_7_BONUS;
        bonusMessage = `\n🎉 <b>مكافأة ${newStreak} يوم!</b> +${STREAK_7_BONUS} نقطة إضافية!`;
        logger?.info("🎉 [Engagement] مكافأة متعددة الأسابيع!");
      }

      const totalPoints = DAILY_CHECKIN_POINTS + bonusPoints;
      logger?.info("📊 [Engagement] إجمالي النقاط المراد منحها:", { basePoints: DAILY_CHECKIN_POINTS, bonusPoints, totalPoints });

      // تحديث بيانات المستخدم
      await client.query(
        `UPDATE competition_users 
         SET total_points = total_points + $1,
             daily_streak = $2,
             last_checkin = $3
         WHERE telegram_id = $4`,
        [totalPoints, newStreak, today, context.telegramId]
      );
      logger?.info("✅ [Engagement] تم تحديث بيانات المستخدم");

      // تحديث أو إنشاء سجل النشاط اليومي
      await client.query(
        `INSERT INTO daily_activity (user_id, telegram_id, activity_date, daily_checkin)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (telegram_id, activity_date) 
         DO UPDATE SET daily_checkin = true`,
        [user.id, context.telegramId, today]
      );
      logger?.info("✅ [Engagement] تم تحديث سجل النشاط اليومي");

      // تأكيد المعاملة
      await client.query('COMMIT');
      logger?.info("✅ [Engagement] تم تأكيد معاملة تسجيل الدخول");

      let streakEmoji = "🔥";
      if (newStreak >= 30) streakEmoji = "🏆";
      else if (newStreak >= 14) streakEmoji = "⭐";
      else if (newStreak >= 7) streakEmoji = "🌟";

      return {
        success: true,
        pointsAwarded: DAILY_CHECKIN_POINTS,
        currentStreak: newStreak,
        bonusAwarded: bonusPoints,
        message: `✅ <b>تم تسجيل دخولك اليومي!</b>

+${DAILY_CHECKIN_POINTS} نقطة ${streakEmoji}
${streakEmoji} <b>سلسلة:</b> ${newStreak} يوم متتالي${bonusMessage}

💡 <i>استمر بتسجيل الدخول يومياً للحصول على مكافآت!</i>`,
      };
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ في معاملة تسجيل الدخول:", error);
      try {
        await client.query('ROLLBACK');
        logger?.info("🔄 [Engagement] تم استرجاع معاملة تسجيل الدخول");
      } catch (rollbackError) {
        logger?.error("❌ [Engagement] خطأ في استرجاع المعاملة:", rollbackError);
      }
      return { success: false, message: "حدث خطأ في تسجيل الدخول" };
    } finally {
      client.release();
      logger?.info("🔓 [Engagement] تم إطلاق اتصال قاعدة البيانات");
    }
  },
});

export const getReferralCode = createTool({
  id: "get-referral-code",
  description: "الحصول على كود الإحالة الخاص بالمستخدم أو إنشاء كود جديد.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    referralCode: z.string().optional(),
    totalReferrals: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🔗 [Engagement] جلب كود الإحالة:", context.telegramId);

    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      await ensureUserExists(context.telegramId, context.username, context.firstName);

      let userResult = await pool.query(
        "SELECT referral_code, total_referrals FROM competition_users WHERE telegram_id = $1",
        [context.telegramId]
      );

      let referralCode = userResult.rows[0].referral_code;
      const totalReferrals = userResult.rows[0].total_referrals || 0;

      if (!referralCode) {
        referralCode = generateReferralCode();
        await pool.query(
          "UPDATE competition_users SET referral_code = $1 WHERE telegram_id = $2",
          [referralCode, context.telegramId]
        );
        logger?.info("🔗 [Engagement] تم إنشاء كود جديد:", referralCode);
      }

      return {
        success: true,
        referralCode,
        totalReferrals,
        message: `<b>🔗 كود الإحالة الخاص بك:</b>

<code>${referralCode}</code>

📊 <b>إحالاتك:</b> ${totalReferrals} شخص

<b>🎁 المكافآت:</b>
• أنت تحصل على <b>+50 نقطة</b> لكل صديق
• صديقك يحصل على <b>+25 نقطة</b>

💡 <i>شارك الكود مع أصدقائك!</i>`,
      };
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ:", error);
      return { success: false, message: "حدث خطأ في جلب كود الإحالة" };
    }
  },
});

export const processReferral = createTool({
  id: "process-referral",
  description: "معالجة كود الإحالة عند انضمام مستخدم جديد.",
  inputSchema: z.object({
    referralCode: z.string().describe("كود الإحالة"),
    refereeTelegramId: z.number().describe("معرف المستخدم الجديد (المُحال)"),
    refereeUsername: z.string().optional().describe("اسم المستخدم الجديد"),
    refereeFirstName: z.string().optional().describe("الاسم الأول للمستخدم الجديد"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    referrerPoints: z.number().optional(),
    refereePoints: z.number().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🎯 [Engagement] معالجة إحالة:", { code: context.referralCode, referee: context.refereeTelegramId });

    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    const client = await pool.connect();
    try {
      logger?.info("🎯 [Engagement] بدء معاملة معالجة الإحالة");
      await client.query('BEGIN');

      // التحقق من عدم وجود إحالة سابقة للمستخدم الجديد
      logger?.info("🔍 [Engagement] فحص وجود إحالات سابقة");
      const existingReferral = await client.query(
        "SELECT * FROM referrals WHERE referee_telegram_id = $1 FOR UPDATE",
        [context.refereeTelegramId]
      );
      logger?.info("📝 [Engagement] نتيجة فحص الإحالات السابقة:", existingReferral.rows.length);

      if (existingReferral.rows.length > 0) {
        logger?.warn("⚠️ [Engagement] المستخدم لديه إحالة سابقة");
        await client.query('COMMIT');
        return {
          success: false,
          message: "⚠️ لقد استخدمت كود إحالة من قبل. لا يمكن استخدام أكثر من كود واحد.",
        };
      }

      // جلب بيانات المُحيل
      logger?.info("🔍 [Engagement] جلب بيانات المحيل بناءً على كود الإحالة");
      const referrerResult = await client.query(
        "SELECT telegram_id, first_name FROM competition_users WHERE referral_code = $1 FOR UPDATE",
        [context.referralCode]
      );
      logger?.info("📝 [Engagement] نتيجة جلب بيانات المحيل");

      if (referrerResult.rows.length === 0) {
        logger?.warn("❌ [Engagement] كود الإحالة غير صالح");
        await client.query('COMMIT');
        return {
          success: false,
          message: "❌ كود الإحالة غير صالح. تأكد من الكود وحاول مرة أخرى.",
        };
      }

      const referrer = referrerResult.rows[0];
      logger?.info("✅ [Engagement] تم العثور على المحيل:", { referrerId: referrer.telegram_id });

      if (referrer.telegram_id === context.refereeTelegramId) {
        logger?.warn("❌ [Engagement] محاولة استخدام الكود الخاص بنفس المستخدم");
        await client.query('COMMIT');
        return {
          success: false,
          message: "❌ لا يمكنك استخدام كود الإحالة الخاص بك!",
        };
      }

      await ensureUserExists(context.refereeTelegramId, context.refereeUsername, context.refereeFirstName);
      logger?.info("✅ [Engagement] تم التحقق من المستخدم الجديد");

      // إنشاء سجل الإحالة
      logger?.info("📝 [Engagement] إنشاء سجل الإحالة");
      await client.query(
        `INSERT INTO referrals (referrer_telegram_id, referee_telegram_id, referral_code, points_awarded)
         VALUES ($1, $2, $3, true)`,
        [referrer.telegram_id, context.refereeTelegramId, context.referralCode]
      );
      logger?.info("✅ [Engagement] تم إنشاء سجل الإحالة");

      // تحديث نقاط المُحيل
      logger?.info("📊 [Engagement] تحديث نقاط المحيل، الإضافة:", REFERRER_POINTS);
      await client.query(
        `UPDATE competition_users 
         SET total_points = total_points + $1,
             total_referrals = total_referrals + 1
         WHERE telegram_id = $2`,
        [REFERRER_POINTS, referrer.telegram_id]
      );
      logger?.info("✅ [Engagement] تم تحديث نقاط المحيل");

      // تحديث نقاط المستخدم الجديد (المُحال)
      logger?.info("📊 [Engagement] تحديث نقاط المحال، الإضافة:", REFEREE_POINTS);
      await client.query(
        `UPDATE competition_users SET total_points = total_points + $1 WHERE telegram_id = $2`,
        [REFEREE_POINTS, context.refereeTelegramId]
      );
      logger?.info("✅ [Engagement] تم تحديث نقاط المحال");

      // تأكيد المعاملة
      await client.query('COMMIT');
      logger?.info("✅ [Engagement] تم تأكيد معاملة الإحالة بنجاح");

      return {
        success: true,
        referrerPoints: REFERRER_POINTS,
        refereePoints: REFEREE_POINTS,
        message: `🎉 <b>تم تفعيل كود الإحالة بنجاح!</b>

✅ حصلت على <b>+${REFEREE_POINTS} نقطة</b> كهدية ترحيبية!
✅ حصل <b>${referrer.first_name || 'صديقك'}</b> على <b>+${REFERRER_POINTS} نقطة</b>

💡 <i>أنشئ كود الإحالة الخاص بك وادعُ أصدقائك!</i>`,
      };
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ في معاملة الإحالة:", error);
      try {
        await client.query('ROLLBACK');
        logger?.info("🔄 [Engagement] تم استرجاع معاملة الإحالة");
      } catch (rollbackError) {
        logger?.error("❌ [Engagement] خطأ في استرجاع المعاملة:", rollbackError);
      }
      return { success: false, message: "حدث خطأ في معالجة الإحالة" };
    } finally {
      client.release();
      logger?.info("🔓 [Engagement] تم إطلاق اتصال قاعدة البيانات");
    }
  },
});

export const getUserEngagementStats = createTool({
  id: "get-user-engagement-stats",
  description: "عرض إحصائيات التفاعل الشاملة للمستخدم: السلسلة اليومية، نقاط الجروب، الإحالات، والمكافآت.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    stats: z.object({
      dailyStreak: z.number(),
      todayGroupPoints: z.number(),
      totalReferrals: z.number(),
      referralCode: z.string(),
      lastCheckin: z.string().nullable(),
      checkedInToday: z.boolean(),
      availableRewards: z.array(z.string()),
    }).optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("📈 [Engagement] جلب إحصائيات التفاعل:", context.telegramId);

    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      await ensureUserExists(context.telegramId);

      const userResult = await pool.query(
        `SELECT daily_streak, total_referrals, referral_code, last_checkin, 
                total_points, rewards_claimed
         FROM competition_users WHERE telegram_id = $1`,
        [context.telegramId]
      );

      if (userResult.rows.length === 0) {
        return { success: false, message: "المستخدم غير موجود" };
      }

      const user = userResult.rows[0];
      const today = new Date().toISOString().split('T')[0];

      const activityResult = await pool.query(
        "SELECT group_points_earned, daily_checkin FROM daily_activity WHERE telegram_id = $1 AND activity_date = $2",
        [context.telegramId, today]
      );

      const todayGroupPoints = activityResult.rows.length > 0 ? activityResult.rows[0].group_points_earned : 0;
      const checkedInToday = activityResult.rows.length > 0 ? activityResult.rows[0].daily_checkin : false;

      const lastCheckinStr = user.last_checkin ? new Date(user.last_checkin).toISOString().split('T')[0] : null;

      const TITLES = [
        { name: "مثقف", min_points: 300, reward: "شهادة رقمية" },
        { name: "عالم", min_points: 1000, reward: "Canva Pro أسبوع" },
        { name: "فيلسوف", min_points: 2500, reward: "Canva Pro شهر" },
        { name: "عبقري", min_points: 6000, reward: "Canva Pro 3 شهور" },
        { name: "خالد", min_points: 10000, reward: "مكافأة خاصة" },
      ];

      const claimedRewards = user.rewards_claimed ? user.rewards_claimed.split(',') : [];
      const availableRewards: string[] = [];

      for (const title of TITLES) {
        if (user.total_points >= title.min_points && !claimedRewards.includes(title.name)) {
          availableRewards.push(`${title.name}: ${title.reward}`);
        }
      }

      logger?.info("✅ [Engagement] تم جلب الإحصائيات");

      let streakEmoji = "🔥";
      if (user.daily_streak >= 30) streakEmoji = "🏆";
      else if (user.daily_streak >= 14) streakEmoji = "⭐";
      else if (user.daily_streak >= 7) streakEmoji = "🌟";

      const remainingGroupPoints = DAILY_GROUP_POINTS_LIMIT - todayGroupPoints;

      let message = `<b>📈 إحصائيات التفاعل</b>

${streakEmoji} <b>سلسلة الدخول:</b> ${user.daily_streak} يوم
${checkedInToday ? '✅' : '⏰'} <b>الدخول اليومي:</b> ${checkedInToday ? 'تم اليوم' : 'لم يتم بعد'}

📊 <b>نقاط الجروب اليوم:</b> ${todayGroupPoints}/${DAILY_GROUP_POINTS_LIMIT}
${remainingGroupPoints > 0 ? `💡 متبقي: ${remainingGroupPoints} نقطة` : '🎉 وصلت للحد الأقصى!'}

🔗 <b>الإحالات:</b> ${user.total_referrals} شخص
<code>${user.referral_code || 'لم يتم إنشاء كود بعد'}</code>`;

      if (availableRewards.length > 0) {
        message += `\n\n🎁 <b>مكافآت متاحة للمطالبة:</b>\n${availableRewards.map(r => `• ${r}`).join('\n')}`;
      }

      return {
        success: true,
        stats: {
          dailyStreak: user.daily_streak,
          todayGroupPoints,
          totalReferrals: user.total_referrals,
          referralCode: user.referral_code || '',
          lastCheckin: lastCheckinStr,
          checkedInToday,
          availableRewards,
        },
        message,
      };
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ:", error);
      return { success: false, message: "حدث خطأ في جلب الإحصائيات" };
    }
  },
});

export const claimReward = createTool({
  id: "claim-reward",
  description: "المطالبة بمكافأة متاحة للمستخدم. إذا لم يتم تحديد rewardTitle، يعرض المكافآت المتاحة للمطالبة.",
  inputSchema: z.object({
    telegramId: z.number().describe("معرف المستخدم على تيليجرام"),
    rewardTitle: z.string().optional().describe("اسم اللقب للمكافأة (مثقف، عالم، فيلسوف، عبقري، خالد) - اختياري"),
    username: z.string().optional().describe("اسم المستخدم"),
    firstName: z.string().optional().describe("الاسم الأول"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reward: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    logger?.info("🎁 [Engagement] طلب مكافأة:", { telegramId: context.telegramId, title: context.rewardTitle });

    if (!process.env.DATABASE_URL) {
      return { success: false, message: "خطأ في إعدادات قاعدة البيانات" };
    }

    try {
      const userResult = await pool.query(
        "SELECT total_points, rewards_claimed, first_name, username FROM competition_users WHERE telegram_id = $1",
        [context.telegramId]
      );

      if (userResult.rows.length === 0) {
        return {
          success: false,
          message: "❌ لم يتم العثور على حسابك. جرب المشاركة في المسابقة أولاً.",
        };
      }

      const user = userResult.rows[0];
      const claimedRewards = user.rewards_claimed ? user.rewards_claimed.split(',') : [];

      // إذا لم يتم تحديد لقب، عرض المكافآت المتاحة
      if (!context.rewardTitle) {
        const availableRewards: string[] = [];
        let nextReward = null;
        
        for (const title of TITLE_REWARDS) {
          if (user.total_points >= title.min_points && !claimedRewards.includes(title.name)) {
            availableRewards.push(`🎁 <b>${title.name}</b>: ${title.reward}`);
          } else if (user.total_points < title.min_points && !nextReward) {
            nextReward = title;
          }
        }
        
        const currentTitle = user.total_points >= 10000 ? "خالد" :
                            user.total_points >= 6000 ? "عبقري" :
                            user.total_points >= 2500 ? "فيلسوف" :
                            user.total_points >= 1500 ? "حكيم" :
                            user.total_points >= 1000 ? "عالم" :
                            user.total_points >= 600 ? "أديب" :
                            user.total_points >= 300 ? "مثقف" :
                            user.total_points >= 100 ? "قارئ" : "مبتدئ";
        
        if (availableRewards.length > 0) {
          return {
            success: true,
            message: `🎁 <b>المكافآت المتاحة للمطالبة</b>

${availableRewards.join('\n')}

📊 <b>نقاطك:</b> ${user.total_points} نقطة
🏆 <b>لقبك:</b> ${currentTitle}

💡 لطلب مكافأة، أرسل: <code>/claim اسم_اللقب</code>
مثال: <code>/claim مثقف</code>`,
          };
        } else {
          let nextRewardMsg = "";
          if (nextReward) {
            const pointsNeeded = nextReward.min_points - user.total_points;
            nextRewardMsg = `\n\n🔜 <b>المكافأة القادمة:</b> ${nextReward.name} (${nextReward.reward})
💪 تحتاج: <b>${pointsNeeded}</b> نقطة إضافية`;
          }
          
          return {
            success: false,
            message: `📊 <b>حالة المكافآت</b>

🏆 <b>لقبك الحالي:</b> ${currentTitle}
📈 <b>نقاطك:</b> ${user.total_points} نقطة

⚠️ لا توجد مكافآت متاحة حالياً.${nextRewardMsg}

💡 <b>كيف تحصل على مكافآت؟</b>
• أجب على أسئلة المسابقة (سؤال) 🎯
• سجل دخولك اليومي (/checkin) ✅
• ادعُ أصدقاءك (/referral) 🔗`,
          };
        }
      }

      const titleReward = TITLE_REWARDS.find(t => t.name === context.rewardTitle);
      
      if (!titleReward) {
        return {
          success: false,
          message: `❌ اللقب "${context.rewardTitle}" غير موجود.\n\n🎯 <b>الألقاب المتاحة:</b>\n• مثقف (300 نقطة)\n• عالم (1000 نقطة)\n• فيلسوف (2500 نقطة)\n• عبقري (6000 نقطة)\n• خالد (10000 نقطة)`,
        };
      }

      if (user.total_points < titleReward.min_points) {
        return {
          success: false,
          message: `❌ أنت بحاجة إلى <b>${titleReward.min_points}</b> نقطة للحصول على هذه المكافأة.\n📊 نقاطك الحالية: <b>${user.total_points}</b>\n💪 تبقى لك: <b>${titleReward.min_points - user.total_points}</b> نقطة`,
        };
      }

      if (claimedRewards.includes(context.rewardTitle)) {
        return {
          success: false,
          message: `⚠️ لقد حصلت على مكافأة لقب <b>${context.rewardTitle}</b> من قبل!\n\n💡 يمكنك المطالبة بمكافآت الألقاب الأخرى التي وصلت إليها.`,
        };
      }

      const client = await pool.connect();
      try {
        logger?.info("🎁 [Engagement] بدء معاملة المطالبة بالمكافأة");
        await client.query('BEGIN');

        // جلب بيانات المستخدم مع القفل للتحقق الأخير
        const userCheckResult = await client.query(
          "SELECT total_points, rewards_claimed FROM competition_users WHERE telegram_id = $1 FOR UPDATE",
          [context.telegramId]
        );
        logger?.info("🔒 [Engagement] تم قفل صف المستخدم للتحقق");

        const updatedUser = userCheckResult.rows[0];
        const updatedClaimedRewards = updatedUser.rewards_claimed ? updatedUser.rewards_claimed.split(',') : [];
        logger?.info("📝 [Engagement] المكافآت المطلوبة الحالية:", updatedClaimedRewards);

        // التحقق النهائي من عدم المطالبة بالمكافأة من قبل
        if (updatedClaimedRewards.includes(context.rewardTitle)) {
          logger?.warn("⚠️ [Engagement] تم المطالبة بهذه المكافأة من قبل بالفعل");
          await client.query('COMMIT');
          return {
            success: false,
            message: `⚠️ لقد حصلت على مكافأة لقب <b>${context.rewardTitle}</b> من قبل!\n\n💡 يمكنك المطالبة بمكافآت الألقاب الأخرى التي وصلت إليها.`,
          };
        }

        // التحقق من كفاية النقاط
        if (updatedUser.total_points < titleReward.min_points) {
          logger?.warn("❌ [Engagement] النقاط غير كافية");
          await client.query('COMMIT');
          return {
            success: false,
            message: `❌ أنت بحاجة إلى <b>${titleReward.min_points}</b> نقطة للحصول على هذه المكافأة.\n📊 نقاطك الحالية: <b>${updatedUser.total_points}</b>\n💪 تبقى لك: <b>${titleReward.min_points - updatedUser.total_points}</b> نقطة`,
          };
        }

        // تحديث المكافآت المطلوبة
        updatedClaimedRewards.push(context.rewardTitle);
        logger?.info("📝 [Engagement] إضافة المكافأة إلى قائمة المطالبات");
        
        await client.query(
          "UPDATE competition_users SET rewards_claimed = $1 WHERE telegram_id = $2",
          [updatedClaimedRewards.join(','), context.telegramId]
        );
        logger?.info("✅ [Engagement] تم تحديث قائمة المكافآت المطلوبة");

        // تأكيد المعاملة قبل الإشعار
        await client.query('COMMIT');
        logger?.info("✅ [Engagement] تم تأكيد معاملة المكافأة");

        // إرسال الإشعار للمشرف (خارج المعاملة)
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const userName = context.firstName || context.username || user.first_name || user.username || `المستخدم ${context.telegramId}`;
        
        const adminNotification = `🎁 <b>طلب مكافأة جديد!</b>

👤 <b>المستخدم:</b> ${userName}
🆔 <b>المعرف:</b> <code>${context.telegramId}</code>
📊 <b>النقاط:</b> ${user.total_points}

🏆 <b>اللقب:</b> ${context.rewardTitle}
🎁 <b>المكافأة:</b> ${titleReward.reward}

━━━━━━━━━━━━━━━
⏰ الوقت: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;

        logger?.info("📨 [Engagement] إرسال إشعار للمشرف");
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            text: adminNotification,
            parse_mode: "HTML",
          }),
        });
        logger?.info("✅ [Engagement] تم إرسال الإشعار للمشرف");

        return {
          success: true,
          reward: titleReward.reward,
          message: `🎉 <b>تم تسجيل طلب المكافأة بنجاح!</b>

🏆 <b>اللقب:</b> ${context.rewardTitle}
🎁 <b>المكافأة:</b> ${titleReward.reward}

✅ تم إبلاغ المشرف وسيتواصل معك قريباً لتسليم المكافأة.

💡 <i>شكراً لتفاعلك ومشاركتك معنا!</i>`,
        };
      } catch (error) {
        logger?.error("❌ [Engagement] خطأ في معاملة المكافأة:", error);
        try {
          await client.query('ROLLBACK');
          logger?.info("🔄 [Engagement] تم استرجاع معاملة المكافأة");
        } catch (rollbackError) {
          logger?.error("❌ [Engagement] خطأ في استرجاع المعاملة:", rollbackError);
        }
        return { success: false, message: "حدث خطأ في طلب المكافأة" };
      } finally {
        client.release();
        logger?.info("🔓 [Engagement] تم إطلاق اتصال قاعدة البيانات");
      }
    } catch (error) {
      logger?.error("❌ [Engagement] خطأ:", error);
      return { success: false, message: "حدث خطأ في طلب المكافأة" };
    }
  },
});
