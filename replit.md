# AI Mock Viva Platform

## Overview

This is an AI-powered oral examination (viva voce) platform that automates the process of conducting and evaluating student oral exams. The system generates questions based on subject content, evaluates student responses using AI, and stores results for administrative review. It features text-to-speech for question delivery and supports both built-in and custom subjects.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, local React state for UI
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **Build Tool**: Vite with custom plugins for Replit integration

The frontend has two main pages:
1. Admin panel (`/`) - View exam results, manage subjects, add manual questions
2. Viva page (`/:subject`) - Student-facing exam interface with voice input/output

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Style**: RESTful JSON API under `/api/*` routes

Key server components:
- `server/routes.ts` - API endpoint definitions
- `server/storage.ts` - Database abstraction layer
- `server/lib/openai-service.ts` - AI question generation and answer evaluation
- `server/lib/google-sheets-service.ts` - Results sync to Google Sheets
- `server/lib/subject-content.ts` - Built-in subject curriculum data

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Managed via `drizzle-kit push`

Database tables:
- `users` - User accounts (id, username, password)
- `viva_results` - Exam results with transcripts and scores
- `subjects` - Custom subjects created by admins
- `manualQuestions` - Manually added exam questions per subject

### AI Integration
- **Provider**: OpenAI (GPT-5)
- **Features**: 
  - Dynamic question generation based on subject curriculum
  - Answer evaluation with scoring and feedback
  - Text-to-speech for question delivery

### External Integrations
- Google Sheets API for syncing exam results (via Replit connectors)
- OpenAI API for AI-powered features

## External Dependencies

### APIs and Services
- **OpenAI API** (`OPENAI_API_KEY` environment variable) - Powers question generation, answer evaluation, and text-to-speech
- **Google Sheets** - Optional integration via Replit connectors for exporting results
- **PostgreSQL** (`DATABASE_URL` environment variable) - Primary data store

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `@tanstack/react-query` - Server state management
- `openai` - OpenAI API client
- `googleapis` - Google Sheets integration
- `express` / `express-session` - HTTP server and sessions
- `zod` / `drizzle-zod` - Schema validation
- `sonner` - Toast notifications
- Radix UI primitives - Accessible UI components via shadcn/ui