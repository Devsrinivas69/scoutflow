# ScoutFlow 🚀

> **One Domain. Unlimited Opportunities.**

ScoutFlow is a production-grade outbound intelligence SaaS platform. Enter one company domain — ScoutFlow automatically discovers lookalike companies, finds decision makers, verifies work emails, and sends personalized outreach campaigns via a mandatory approval gate.

---

## ✨ Features

- 🔍 **Company Discovery** — Ocean.io finds 25+ lookalike companies
- 👥 **Decision Maker Intelligence** — Prospeo identifies CEOs, VPs, Directors
- ✅ **Email Retrieval** — Prospeo extracts real verified emails
- ✉️ **Personalized Outreach** — Resend sends tailored campaigns
- 🛡️ **Mandatory Approval Gate** — Emails never send without your approval
- 📊 **Analytics Dashboard** — Delivery, open, and response rates
- 📥 **Exports** — CSV and JSON for contacts and companies

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, TailwindCSS |
| Backend | Next.js API Routes |
| Database | PostgreSQL + Prisma ORM |
| Queue | BullMQ + Redis |
| Auth | NextAuth v5 |
| Email | Resend REST API |
| Deployment | Railway |

---

## 🚀 Quick Start (Local Dev)

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Redis instance

### 1. Clone & Install

```bash
git clone https://github.com/yourorg/scoutflow
cd scoutflow
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Fill in your credentials in .env
```

Required variables:

```env
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
NEXTAUTH_SECRET="..."          # generate: openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
OCEAN_API_KEY="..."
PROSPEO_API_KEY="..."
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="..."
RESEND_FROM_NAME="..."
# RESEND_REPLY_TO="..."
```

### 3. Setup Database

```bash
npx prisma migrate dev --name init
```

### 4. Start Development

In two separate terminals:

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: BullMQ Worker
npm run worker
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🚂 Deploy to Railway

### Step 1 — Create Railway Project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Select **Deploy from GitHub**
3. Connect your repository

### Step 2 — Add Database Plugins

In your Railway project:
1. Click **+ New** → **Database** → **PostgreSQL**
   - Railway auto-sets `DATABASE_URL`
2. Click **+ New** → **Database** → **Redis**
   - Railway auto-sets `REDIS_URL`

### Step 3 — Add Worker Service

1. Click **+ New** → **GitHub Repo** (same repo)
2. Set **Start Command** to: `npx tsx worker.ts`
3. This is your background BullMQ worker

### Step 4 — Set Environment Variables

In Railway dashboard → your app service → **Variables**, add:

```
NEXTAUTH_SECRET=<generated>
NEXTAUTH_URL=https://your-app.up.railway.app
OCEAN_API_KEY=api_84fdAP_...
PROSPEO_API_KEY=pk_ac492b67...
RESEND_API_KEY=re_LKgoVfzm...
RESEND_FROM_EMAIL=contact@scout-flow.app
RESEND_FROM_NAME=ScoutFlow
RESEND_REPLY_TO=reddykph@gmail.com
```

Copy the same variables to the **worker service**.

### Step 5 — Run Migrations

In Railway dashboard → your app service → **Shell**:

```bash
npx prisma migrate deploy
```

### Step 6 — Done!

Both services will be live. Railway provides the URL automatically.

---

## 📁 Project Structure

```
scoutflow/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── sign-in/                    # Auth pages
│   ├── sign-up/
│   ├── (app)/                      # Protected app
│   │   ├── dashboard/
│   │   ├── pipeline/[id]/          # Live pipeline view
│   │   ├── prospects/
│   │   ├── campaigns/
│   │   ├── reports/
│   │   └── settings/
│   └── api/
│       ├── pipeline/start/
│       ├── pipeline/[id]/status/
│       ├── pipeline/[id]/approve/  # ← Emails only send here
│       ├── prospects/
│       ├── campaigns/
│       └── exports/
├── lib/
│   ├── services/                   # Ocean, Prospeo, Resend
│   ├── queue/                      # BullMQ pipeline worker
│   ├── db/prisma.ts                # Prisma singleton
│   └── utils/                      # env validation, retry, email-template
├── prisma/schema.prisma            # 10-table schema
├── worker.ts                       # Railway worker entry point
└── railway.toml                    # Railway deployment config
```

---

## 🔄 Pipeline Flow

```
User → /pipeline → enters domain
  → POST /api/pipeline/start
  → BullMQ job created
  → Worker: Stage 1 (Ocean.io) → companies saved
  → Worker: Stage 2 (Prospeo) → contacts saved
  → Worker: Stage 3 (EazyReach) → Prospeo emails gathered
  → Worker: Stage 4 → email drafts generated
  → Status: PENDING_APPROVAL ← approval gate
  → User reviews + approves
  → POST /api/pipeline/[id]/approve
  → Resend sends emails
  → Status: COMPLETED
```

---

## 🔐 Security

- Secrets via environment variables only — never hardcoded
- Zod env validation at startup — app won't start with missing vars
- NextAuth JWT sessions
- Server-side org isolation on all API routes
- Bcrypt password hashing (12 rounds)

---

## 📝 License

MIT © ScoutFlow
