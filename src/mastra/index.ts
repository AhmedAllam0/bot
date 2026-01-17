import { Mastra } from "@mastra/core";
import { MastraError } from "@mastra/core/error";
import { PinoLogger } from "@mastra/loggers";
import { LogLevel, MastraLogger } from "@mastra/core/logger";
import pino from "pino";
import { NonRetriableError } from "inngest";
import { z } from "zod";

import { sharedPostgresStorage } from "./storage";
import { inngest, inngestServe } from "./inngest";
import { bookSearchAgent } from "./agents/bookSearchAgent";
import { bookSearchWorkflow } from "./workflows/bookSearchWorkflow";
import { registerTelegramTrigger } from "../triggers/telegramTriggers";
import { getAdminDashboardStats, getRecentMessages, getUsersList } from "./tools/adminDashboard";
import { sharedPool } from "./db/pool";

// ======================================================================
// Option 1: FOR TIME-BASED (CRON) TRIGGERS
// ======================================================================
// Call registerCronTrigger() BEFORE the Mastra initialization below.
//
// Example:
//   import { registerCronTrigger } from "../triggers/cronTriggers";
//   import { myWorkflow } from "./workflows/myWorkflow";
//
//   registerCronTrigger({
//     cronExpression: "0 8 * * *", // Daily at 8 AM
//     workflow: myWorkflow
//   });
//
// See src/triggers/cronTriggers.ts for details
// ======================================================================
// Option 2: FOR WEBHOOK-BASED TRIGGERS
// ======================================================================
// Spread trigger registration functions into this apiRoutes array.
//
// Pattern:
//   import { registerYourTrigger } from "../triggers/yourTriggers";
//   import { myWorkflow } from "./workflows/myWorkflow";
//   import { inngest } from "./inngest";
//
//   ...registerYourTrigger({
//     triggerType: "your/event.type",
//     handler: async (mastra, triggerInfo, runId) => {
//       // Extract what you need from the payload
//       ...
//
//       // Create a run of the workflow unless one was provided
//       if (!runId) {
//         runId = (await myWorkflow.createRunAsync()).runId;
//       }
//       // Start the workflow
//       return await inngest.send({
//         name: `workflow.${myWorkflow.id}`,
//         data: {
//           runId,
//           inputData: {
//             // Your input data here
//           },
//         },
//       });
//     }
//   })
//
// Available: src/triggers/slackTriggers.ts, telegramTriggers.ts, exampleConnectorTrigger.ts
// ======================================================================

// ======================================================================
// IMPORT YOUR AGENTS AND WORKFLOWS
// ======================================================================
// Import your custom agents and workflows here.
// See src/examples/ directory for complete examples:
// - src/examples/exampleAgent.ts
// - src/examples/exampleWorkflow.ts
// - src/examples/exampleTool.ts
//
// Example imports:
// import { myAgent } from "./agents/myAgent";
// import { myWorkflow } from "./workflows/myWorkflow";
// ======================================================================

class ProductionPinoLogger extends MastraLogger {
  protected logger: pino.Logger;

  constructor(
    options: {
      name?: string;
      level?: LogLevel;
    } = {},
  ) {
    super(options);

    this.logger = pino({
      name: options.name || "app",
      level: options.level || LogLevel.INFO,
      base: {},
      formatters: {
        level: (label: string, _number: number) => ({
          level: label,
        }),
      },
      timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
    });
  }

  debug(message: string, args: Record<string, any> = {}): void {
    this.logger.debug(args, message);
  }

  info(message: string, args: Record<string, any> = {}): void {
    this.logger.info(args, message);
  }

  warn(message: string, args: Record<string, any> = {}): void {
    this.logger.warn(args, message);
  }

  error(message: string, args: Record<string, any> = {}): void {
    this.logger.error(args, message);
  }
}

export const mastra = new Mastra({
  storage: sharedPostgresStorage,
  // Register your workflows here
  workflows: {
    [bookSearchWorkflow.id]: bookSearchWorkflow,
  },
  // Register your agents here
  agents: {
    "book-search-agent": bookSearchAgent,
  },
  bundler: {
    // A few dependencies are not properly picked up by
    // the bundler if they are not added directly to the
    // entrypoint.
    externals: [
      "@slack/web-api",
      "inngest",
      "inngest/hono",
      "hono",
      "hono/streaming",
    ],
    // sourcemaps are good for debugging.
    sourcemap: true,
  },
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5000),
    middleware: [
      async (c, next) => {
        const mastra = c.get("mastra");
        const logger = mastra?.getLogger();
        logger?.debug("[Request]", { method: c.req.method, url: c.req.url });
        try {
          await next();
        } catch (error) {
          logger?.error("[Response]", {
            method: c.req.method,
            url: c.req.url,
            error,
          });
          if (error instanceof MastraError) {
            if (error.id === "AGENT_MEMORY_MISSING_RESOURCE_ID") {
              // This is typically a non-retirable error. It means that the request was not
              // setup correctly to pass in the necessary parameters.
              throw new NonRetriableError(error.message, { cause: error });
            }
          } else if (error instanceof z.ZodError) {
            // Validation errors are never retriable.
            throw new NonRetriableError(error.message, { cause: error });
          }

          throw error;
        }
      },
    ],
    apiRoutes: [
      // ======================================================================
      // Health Check Endpoint for Cloud Run (must be under /api/ path)
      // ======================================================================
      {
        path: "/api/health",
        method: "GET",
        createHandler: async () => async (c: any) => {
          return c.json({ status: "ok", service: "خلاصة الكتب Bot" }, 200);
        },
      },
      // ======================================================================
      // Inngest Integration Endpoint
      // ======================================================================
      // Integrates Mastra workflows with Inngest for event-driven execution via inngest functions.
      {
        path: "/api/inngest",
        method: "ALL",
        createHandler: async ({ mastra }) => inngestServe({ mastra, inngest }),
      },

      // ======================================================================
      // Admin Dashboard API Routes (Protected with SESSION_SECRET)
      // ======================================================================
      {
        path: "/api/admin/dashboard",
        method: "GET",
        createHandler: async ({ mastra }) => async (c: any) => {
          const logger = mastra?.getLogger();
          const authToken = c.req.header("X-Admin-Token") || c.req.query("token");
          if (!authToken || authToken !== process.env.SESSION_SECRET) {
            logger?.warn("🚫 [Admin] محاولة وصول غير مصرح");
            return c.json({ success: false, message: "غير مصرح" }, 401);
          }
          const timeRange = c.req.query("timeRange") || "today";
          logger?.info("📊 [Admin] طلب إحصائيات الداشبورد", { timeRange });
          
          try {
            const result = await getAdminDashboardStats.execute?.({
              context: { timeRange },
              mastra,
              runId: "",
              runtimeContext: {} as any,
            });
            return c.json(result || { success: false, message: "خطأ" });
          } catch (error: any) {
            logger?.error("❌ [Admin] خطأ:", error);
            return c.json({ success: false, message: error.message }, 500);
          }
        },
      },
      {
        path: "/api/admin/messages",
        method: "GET",
        createHandler: async ({ mastra }) => async (c: any) => {
          const logger = mastra?.getLogger();
          const authToken = c.req.header("X-Admin-Token") || c.req.query("token");
          if (!authToken || authToken !== process.env.SESSION_SECRET) {
            return c.json({ success: false, message: "غير مصرح" }, 401);
          }
          const limit = parseInt(c.req.query("limit") || "50");
          logger?.info("📝 [Admin] طلب آخر الرسائل", { limit });
          
          try {
            const result = await getRecentMessages.execute?.({
              context: { limit },
              mastra,
              runId: "",
              runtimeContext: {} as any,
            });
            return c.json(result || { success: false, message: "خطأ" });
          } catch (error: any) {
            logger?.error("❌ [Admin] خطأ:", error);
            return c.json({ success: false, message: error.message }, 500);
          }
        },
      },
      {
        path: "/api/admin/users",
        method: "GET",
        createHandler: async ({ mastra }) => async (c: any) => {
          const logger = mastra?.getLogger();
          const authToken = c.req.header("X-Admin-Token") || c.req.query("token");
          if (!authToken || authToken !== process.env.SESSION_SECRET) {
            return c.json({ success: false, message: "غير مصرح" }, 401);
          }
          const limit = parseInt(c.req.query("limit") || "100");
          const sortBy = c.req.query("sortBy") || "totalPoints";
          logger?.info("👥 [Admin] طلب قائمة المستخدمين", { limit, sortBy });
          
          try {
            const result = await getUsersList.execute?.({
              context: { limit, sortBy },
              mastra,
              runId: "",
              runtimeContext: {} as any,
            });
            return c.json(result || { success: false, message: "خطأ" });
          } catch (error: any) {
            logger?.error("❌ [Admin] خطأ:", error);
            return c.json({ success: false, message: error.message }, 500);
          }
        },
      },
      {
        path: "/admin",
        method: "GET",
        createHandler: async () => async (c: any) => {
          const authToken = c.req.query("token");
          if (!authToken || authToken !== process.env.SESSION_SECRET) {
            return c.html(`<!DOCTYPE html><html dir="rtl"><head><title>تسجيل الدخول</title><style>body{background:#1a1a2e;color:#eee;font-family:Arial;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.login{background:#16213e;padding:40px;border-radius:12px;text-align:center}input{padding:12px;font-size:16px;border-radius:8px;border:1px solid #0f3460;margin:10px;background:#0f3460;color:#eee}button{background:#e94560;color:white;border:none;padding:12px 30px;border-radius:8px;cursor:pointer;font-size:16px}</style></head><body><div class="login"><h1>🔐 لوحة التحكم</h1><form method="get"><input type="password" name="token" placeholder="كلمة المرور"><br><button type="submit">دخول</button></form></div></body></html>`);
          }
          const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>لوحة تحكم بوت خلاصة الكتب</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #16213e, #1a1a2e); padding: 20px; text-align: center; border-bottom: 2px solid #0f3460; }
    .header h1 { color: #e94560; font-size: 1.8em; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: #16213e; border-radius: 12px; padding: 20px; text-align: center; border: 1px solid #0f3460; }
    .stat-card .number { font-size: 2.5em; color: #e94560; font-weight: bold; }
    .stat-card .label { color: #a0a0a0; margin-top: 5px; }
    .section { background: #16213e; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #0f3460; }
    .section h2 { color: #e94560; margin-bottom: 15px; border-bottom: 1px solid #0f3460; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: right; border-bottom: 1px solid #0f3460; }
    th { background: #0f3460; color: #e94560; }
    tr:hover { background: rgba(233, 69, 96, 0.1); }
    .badge { padding: 4px 12px; border-radius: 20px; font-size: 0.8em; }
    .badge-success { background: #28a745; color: white; }
    .badge-info { background: #17a2b8; color: white; }
    .loading { text-align: center; padding: 40px; color: #a0a0a0; }
    .refresh-btn { background: #e94560; color: white; border: none; padding: 10px 25px; border-radius: 8px; cursor: pointer; margin: 10px; }
    .refresh-btn:hover { background: #d13354; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { background: #0f3460; color: #eee; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }
    .tab.active { background: #e94560; }
    .time-range { display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📚 لوحة تحكم بوت خلاصة الكتب</h1>
    <p style="color: #a0a0a0; margin-top: 10px;">مراقبة النشاط والإحصائيات</p>
  </div>
  <div class="container">
    <div class="time-range">
      <button class="tab active" onclick="loadStats('today')">اليوم</button>
      <button class="tab" onclick="loadStats('week')">الأسبوع</button>
      <button class="tab" onclick="loadStats('month')">الشهر</button>
      <button class="tab" onclick="loadStats('all')">الكل</button>
      <button class="refresh-btn" onclick="refreshAll()">🔄 تحديث</button>
    </div>
    <div class="stats-grid" id="statsGrid"><div class="loading">⏳ جاري التحميل...</div></div>
    <div class="section">
      <h2>👥 أنشط المستخدمين</h2>
      <div id="topUsers"><div class="loading">⏳ جاري التحميل...</div></div>
    </div>
    <div class="section">
      <h2>📝 آخر الرسائل</h2>
      <div id="recentMessages"><div class="loading">⏳ جاري التحميل...</div></div>
    </div>
  </div>
  <script>
    let currentRange = 'today';
    const token = new URLSearchParams(window.location.search).get('token');
    async function loadStats(range) {
      currentRange = range;
      document.querySelectorAll('.time-range .tab').forEach(t => t.classList.remove('active'));
      if(event && event.target) event.target.classList.add('active');
      try {
        const res = await fetch('/api/admin/dashboard?timeRange=' + range + '&token=' + token);
        const data = await res.json();
        if (data.success && data.stats) {
          const s = data.stats;
          document.getElementById('statsGrid').innerHTML = \`
            <div class="stat-card"><div class="number">\${s.totalMessages || 0}</div><div class="label">إجمالي الرسائل</div></div>
            <div class="stat-card"><div class="number">\${s.uniqueUsers || 0}</div><div class="label">المستخدمين الفريدين</div></div>
            <div class="stat-card"><div class="number">\${s.bookSearches || 0}</div><div class="label">عمليات البحث</div></div>
            <div class="stat-card"><div class="number">\${s.pdfDownloads || 0}</div><div class="label">التحميلات</div></div>
            <div class="stat-card"><div class="number">\${s.newUsersCount || s.newUsers || 0}</div><div class="label">مستخدمين جدد</div></div>
            <div class="stat-card"><div class="number">\${s.averageProcessingTime ? s.averageProcessingTime.toFixed(0) + 'ms' : '0ms'}</div><div class="label">متوسط وقت المعالجة</div></div>
          \`;
          if (s.topUsers && s.topUsers.length > 0) {
            document.getElementById('topUsers').innerHTML = '<table><tr><th>#</th><th>المستخدم</th><th>النقاط</th><th>السلسلة</th><th>الإحالات</th></tr>' +
              s.topUsers.map((u, i) => \`<tr><td>\${i+1}</td><td>\${u.firstName || u.username || 'مستخدم'}</td><td><span class="badge badge-success">\${u.totalPoints || 0}</span></td><td>\${u.dailyStreak || 0} يوم</td><td>\${u.totalReferrals || 0}</td></tr>\`).join('') + '</table>';
          } else {
            document.getElementById('topUsers').innerHTML = '<p style="text-align:center;color:#a0a0a0">لا يوجد مستخدمين بعد</p>';
          }
        }
      } catch(e) { console.error(e); }
    }
    async function loadMessages() {
      try {
        const res = await fetch('/api/admin/messages?limit=30&token=' + token);
        const data = await res.json();
        if (data.success && data.messages && data.messages.length > 0) {
          document.getElementById('recentMessages').innerHTML = '<table><tr><th>الوقت</th><th>المستخدم</th><th>الرسالة</th><th>النوع</th></tr>' +
            data.messages.map(m => \`<tr><td>\${new Date(m.createdAt).toLocaleString('ar-EG')}</td><td>\${m.firstName || m.username || m.telegramId}</td><td>\${(m.messagePreview || '').substring(0, 50)}...</td><td><span class="badge badge-info">\${m.messageType}</span></td></tr>\`).join('') + '</table>';
        } else {
          document.getElementById('recentMessages').innerHTML = '<p style="text-align:center;color:#a0a0a0">لا توجد رسائل بعد</p>';
        }
      } catch(e) { console.error(e); }
    }
    async function refreshAll() { await Promise.all([loadStats(currentRange), loadMessages()]); }
    refreshAll();
    setInterval(refreshAll, 30000);
  </script>
</body>
</html>`;
          return c.html(html);
        },
      },
      
      // Telegram Webhook Trigger
      ...registerTelegramTrigger({
        triggerType: "telegram/message",
        handler: async (mastra, triggerInfo) => {
          const logger = mastra.getLogger();
          logger?.info("📨 [Telegram Trigger] رسالة جديدة:", {
            chatId: triggerInfo.params.chatId,
            userId: triggerInfo.params.userId,
            message: triggerInfo.params.message.substring(0, 50),
          });

          const run = await bookSearchWorkflow.createRunAsync();
          
          logger?.info("🚀 [Telegram Trigger] بدء Workflow:", { runId: run?.runId });
          
          await inngest.send({
            name: `workflow.${bookSearchWorkflow.id}`,
            data: {
              runId: run?.runId,
              inputData: {
                chatId: triggerInfo.params.chatId,
                userId: triggerInfo.params.userId,
                userName: triggerInfo.params.userName,
                message: triggerInfo.params.message,
                messageId: triggerInfo.params.messageId,
              },
            },
          });
        },
      }),
    ],
  },
  logger:
    process.env.NODE_ENV === "production"
      ? new ProductionPinoLogger({
          name: "Mastra",
          level: "info",
        })
      : new PinoLogger({
          name: "Mastra",
          level: "info",
        }),
});

/*  Sanity check 1: Throw an error if there are more than 1 workflows.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getWorkflows()).length > 1) {
  throw new Error(
    "More than 1 workflows found. Currently, more than 1 workflows are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}

/*  Sanity check 2: Throw an error if there are more than 1 agents.  */
// !!!!!! Do not remove this check. !!!!!!
if (Object.keys(mastra.getAgents()).length > 1) {
  throw new Error(
    "More than 1 agents found. Currently, more than 1 agents are not supported in the UI, since doing so will cause app state to be inconsistent.",
  );
}
