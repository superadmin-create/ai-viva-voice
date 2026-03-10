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

The frontend has three main pages:
1. Login page (`/`) - Shown when not authenticated, allows admin login
2. Admin panel (`/`) - View exam results, manage subjects, questions, and users (requires login)
3. Viva page (`/:subject`) - Student-facing exam interface with voice input/output (no auth required)

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
- `users` - User accounts (id, username, password, role) with session-based auth
- `viva_results` - Exam results with transcripts and scores
- `subjects` - Custom subjects created by admins
- `manualQuestions` - Manually added exam questions per subject
- `subject_documents` - Uploaded PDF/DOCX files with extracted text for AI reference
- `session` - Express session store (auto-created by connect-pg-simple)

### Authentication & Authorization
- Session-based authentication using `express-session` with `connect-pg-simple` for PostgreSQL session storage
- Password hashing using Node.js `crypto.scryptSync` with random salt
- Default admin user seeded on startup (username: `admin`, password: `admin123`)
- Two roles: `admin` (full access) and `user` (scoped access)
- **Admin role**: Can create/delete/manage all users, view all subjects, results, and questions
- **User role**: Can only create/view/manage their own subjects and related results/questions; cannot see other users or their data
- Subjects have a `createdBy` field linking to the user who created them
- All `/api/admin/*` routes protected with `requireAuth` middleware; user management routes use `requireAdmin`
- Student-facing viva routes (`/:subject`) do not require authentication

### AI Integration
- **Provider**: OpenAI (GPT-5)
- **Features**: 
  - Dynamic question generation based on subject curriculum and uploaded documents
  - Answer evaluation with scoring and feedback, referencing uploaded document content
  - Text-to-speech for question delivery
  - Document text extraction from PDF (pdf-parse) and DOCX (mammoth) files

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
- `multer` - File upload handling
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX text extraction
- Radix UI primitives - Accessible UI components via shadcn/ui