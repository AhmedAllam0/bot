# Replit.md

## Overview

This is a Mastra-based AI automation project that enables building agentic workflows with TypeScript. The system uses Mastra for agent orchestration, Inngest for durable workflow execution, and supports multiple trigger types (time-based cron, webhooks from Slack/Telegram/Linear). The architecture is designed around agents that use LLMs and tools to solve tasks, with workflows providing explicit control over multi-step processes.

**Primary Application**: Telegram Book Search Bot "خلاصة الكتب" - An Arabic book search and download bot with engagement features.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (January 2026)

### Bug Fixes
- **Fixed tool calls**: Switched from Mistral to OpenAI AI Integrations for reliable tool execution with generateLegacy
- **Fixed points system**: Added database transactions with `BEGIN/COMMIT` and `SELECT FOR UPDATE` locking to prevent race conditions and duplicate awards
- **Admin message filtering**: Messages from admin IDs (1002139582646, 1002129652576) are now ignored
- **Fixed callback spinner**: Added `answerCallbackQuery` to acknowledge inline button presses and remove loading spinner
- **Fixed long messages**: Added message splitting for responses exceeding Telegram's 4096 character limit
- **Improved error logging**: Telegram API errors now log HTTP status, statusText, and error body for debugging
- **HTML parse fallback**: If HTML formatting fails, messages are automatically retried without formatting

### Removed Features
- **Competition system**: Completely removed (deleted competition.ts and all references)

### New Features
- **Admin Dashboard**: Protected web interface at `/admin` with SESSION_SECRET authentication
  - Real-time statistics (messages, users, searches, downloads)
  - Top users leaderboard
  - Recent messages log
- **Book Cache System**: Caches search results to improve performance (`book_cache` table)
- **Notifications System**: Subscribe to author/category alerts (`user_subscriptions` table)
- **Advanced Search**: Search with filters (author, category, popularity)
- **Reading Statistics**: Per-user stats (books downloaded, search history, streak)

### Database Migrations
- `001_add_unique_constraint_daily_activity`: Prevents duplicate daily activity entries
- `002_create_core_tables`: Creates competition_users, daily_activity, referrals, message_logs, admin_stats
- `003_create_book_cache_table`: Caches book search results
- `004_create_user_subscriptions_table`: User notification subscriptions

## System Architecture

### Core Framework
- **Mastra Framework**: Primary orchestration layer for agents, tools, and workflows
- **Inngest Integration**: Provides durable execution with automatic retries, step-by-step memoization, and real-time monitoring. Critical for production reliability - if a workflow fails, execution can resume from the last successful step

### Agent Architecture
- Agents are defined in `src/mastra/agents/` with system instructions, model configuration, and optional tools/memory
- Agents use the `generateLegacy()` method for Replit Playground UI compatibility (required for backwards compatibility)
- Memory system supports conversation history, semantic recall, and working memory with configurable scopes (thread-scoped or resource-scoped)
- **Current LLM**: OpenAI GPT-4o via Replit AI Integrations (no API key needed)

### Workflow Architecture
- Workflows defined in `src/mastra/workflows/` using `createWorkflow` and `createStep`
- Steps have explicit `inputSchema` and `outputSchema` for type safety
- Support for chaining (`.then()`), parallel execution (`.parallel()`), branching, and human-in-the-loop with suspend/resume
- Workflows can call agents using `mastra.getAgent()` within step execute functions

### Trigger System
- **Time-based triggers**: Use `registerCronTrigger()` called before Mastra initialization in `src/mastra/index.ts`
- **Webhook triggers**: Use `registerApiRoute()` spread into the `apiRoutes` array in `src/mastra/index.ts`
- Trigger implementations live in `src/triggers/` directory (telegramTriggers.ts, slackTriggers.ts, cronTriggers.ts)

### Storage Layer
- PostgreSQL with `@mastra/pg` for persistent storage
- LibSQL with `@mastra/libsql` as alternative storage option
- Shared pool pattern in `src/mastra/db/pool.ts` and `src/mastra/storage.ts`
- Drizzle ORM for database schema management

### Entry Point
- Main Mastra instance exported from `src/mastra/index.ts`
- Inngest client and serve function imported from `src/mastra/inngest/`
- All agents, workflows, and triggers registered through the main Mastra configuration

## Tools Overview

### Book Tools
- `find_book_download_link`: Search for book download links
- `send_book_pdf`: Send PDF directly to user
- `get_book_summary`: Get book summary
- `get_book_recommendations`: Get book recommendations
- `get_book_quotes`: Get book quotes
- `get_author_info`: Get author information
- `get_audio_summary`: Generate audio summary

### Engagement Tools
- `checkin_daily`: Daily check-in for points
- `get_engagement_stats`: Get user engagement statistics
- `get_referral_code`: Get user referral code
- `process_referral`: Process a referral code
- `claim_reward`: Claim title rewards
- `award_group_activity_points`: Award points for group activity

### New Tools (January 2026)
- `cache_book_search`: Cache book search results
- `get_cached_book`: Get cached book info
- `get_popular_books`: Get most searched books
- `subscribe_notifications`: Subscribe to author/category notifications
- `get_my_subscriptions`: Get user subscriptions
- `unsubscribe_notifications`: Unsubscribe from notifications
- `advanced_book_search`: Search with filters
- `get_reading_statistics`: Get user reading stats
- `get_top_books_this_week`: Get trending books

### Admin Tools
- `getDashboardStats`: Get dashboard statistics
- `getRecentMessages`: Get recent messages
- `getUsersList`: Get users list

## External Dependencies

### AI/LLM Providers
- **OpenAI**: `@ai-sdk/openai` for GPT models (via Replit AI Integrations)
- **Mistral**: `@ai-sdk/mistral` for Mistral models (available but not used)
- **OpenRouter**: `@openrouter/ai-sdk-provider` for multi-provider routing
- **Vercel AI SDK**: `ai` package for unified AI interface

### Workflow Orchestration
- **Inngest**: `inngest` and `@mastra/inngest` for durable workflow execution with real-time monitoring at localhost:3000 during development

### Messaging Integrations
- **Slack**: `@slack/web-api` for Slack bot integration
- **Telegram**: Custom webhook handler in telegramTriggers.ts

### Database
- **PostgreSQL**: `@mastra/pg` and `pg` for production storage
- **LibSQL**: `@mastra/libsql` for lightweight/local storage
- **Drizzle**: `drizzle-zod` for schema validation

### Logging & Monitoring
- **Pino**: `pino` for structured logging
- **Mastra Loggers**: `@mastra/loggers` for PinoLogger integration

### Development Tools
- Development server: `npm run dev` (runs mastra dev on port 5000)
- Inngest dev server: `inngest dev -u http://localhost:5000/api/inngest --port 3000`
- TypeScript with ES2022 modules and bundler resolution

## Admin Dashboard

Access the admin dashboard at `/admin?token=YOUR_SESSION_SECRET`

### API Endpoints (require token authentication)
- `GET /api/admin/dashboard?timeRange=today|week|month|all&token=TOKEN`
- `GET /api/admin/messages?limit=50&token=TOKEN`
- `GET /api/admin/users?limit=100&sortBy=totalPoints&token=TOKEN`

## Environment Variables

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `SESSION_SECRET`: Admin dashboard authentication token

### AI Integration (auto-configured)
- `AI_INTEGRATIONS_OPENAI_BASE_URL`: Replit AI Integrations endpoint
- `AI_INTEGRATIONS_OPENAI_API_KEY`: Replit AI Integrations key

### Optional
- `MISTRAL_API_KEY`: Mistral API key (not currently used)
- `FIRECRAWL_API_KEY`: Firecrawl API key for web scraping
