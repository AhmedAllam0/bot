# Replit.md

## Overview

This is a Mastra-based AI automation project that enables building agentic workflows with TypeScript. The system uses Mastra for agent orchestration, Inngest for durable workflow execution, and supports multiple trigger types (time-based cron, webhooks from Slack/Telegram/Linear). The architecture is designed around agents that use LLMs and tools to solve tasks, with workflows providing explicit control over multi-step processes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Core Framework
- **Mastra Framework**: Primary orchestration layer for agents, tools, and workflows
- **Inngest Integration**: Provides durable execution with automatic retries, step-by-step memoization, and real-time monitoring. Critical for production reliability - if a workflow fails, execution can resume from the last successful step

### Agent Architecture
- Agents are defined in `src/mastra/agents/` with system instructions, model configuration, and optional tools/memory
- Agents use the `generateLegacy()` method for Replit Playground UI compatibility (required for backwards compatibility)
- Memory system supports conversation history, semantic recall, and working memory with configurable scopes (thread-scoped or resource-scoped)

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

## External Dependencies

### AI/LLM Providers
- **OpenAI**: `@ai-sdk/openai` for GPT models
- **Mistral**: `@ai-sdk/mistral` for Mistral models
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