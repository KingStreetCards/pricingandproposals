# Mural Health Pricing Engine — Architecture & Deployment Guide

## Overview

A production-grade internal pricing tool for the Mural Health sales team. Built with **Next.js** (React), **Supabase** (PostgreSQL + Auth), and deployed on **Vercel**.

---

## Why This Stack

| Requirement | Solution |
|---|---|
| Multi-user with login | Supabase Auth (Google SSO or email) |
| Database with audit trail | Supabase PostgreSQL |
| Easy rate card updates | Admin UI for non-technical users |
| Google Sheets integration | Supabase has REST API; can sync to/from Sheets |
| Scalable & maintainable | Next.js — your eng team already knows React |
| Low cost to start | Both Vercel and Supabase have generous free tiers |
| Future AWS migration | Standard PostgreSQL — can migrate anywhere |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Vercel (Hosting)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           Next.js Application                 │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────────┐  │  │
│  │  │Dashboard │  │ Editor   │  │ Admin Panel │  │  │
│  │  │(list)    │  │(pricing) │  │ (rate card) │  │  │
│  │  └─────────┘  └──────────┘  └─────────────┘  │  │
│  │         │            │             │          │  │
│  │  ┌──────────────────────────────────────────┐ │  │
│  │  │     API Routes (Next.js /api/*)          │ │  │
│  │  │  • /api/proposals   (CRUD)               │ │  │
│  │  │  • /api/rate-card   (read/update)        │ │  │
│  │  │  • /api/extract     (protocol → AI)      │ │  │
│  │  └──────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                 Supabase (Backend)                   │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ PostgreSQL DB │  │   Auth     │  │  Storage    │ │
│  │              │  │(Google SSO)│  │ (protocols) │ │
│  │ • proposals  │  └────────────┘  └─────────────┘ │
│  │ • rate_cards │                                   │
│  │ • discounts  │  ┌────────────┐                   │
│  │ • versions   │  │ Row-Level  │                   │
│  │ • users      │  │ Security   │                   │
│  └──────────────┘  └────────────┘                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ (optional, Phase 2)
┌─────────────────────────────────────────────────────┐
│              Google Sheets (Sync)                    │
│  Rate card changes in Sheets → webhook → DB update  │
│  Proposal exports → Sheets for reporting            │
└─────────────────────────────────────────────────────┘
```

---

## Step-by-Step Setup (≈30 minutes)

### Step 1: Create Supabase Project (5 min)

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **"New Project"**
3. Name it `mural-pricing-engine`
4. Set a database password (save it somewhere safe)
5. Choose region closest to your team (e.g., `us-east-1`)
6. Click **"Create new project"** — wait ~2 minutes

Once created, go to **Settings → API** and note:
- **Project URL** (e.g., `https://xyzxyz.supabase.co`)
- **anon (public) key** (starts with `eyJ...`)
- **service_role key** (starts with `eyJ...`) — keep this secret

### Step 2: Set Up Database (5 min)

1. In Supabase, go to **SQL Editor**
2. Click **"New query"**
3. Paste the entire contents of `supabase/schema.sql` (provided below)
4. Click **"Run"**

This creates all tables, indexes, row-level security policies, and seeds the rate card data.

### Step 3: Set Up Authentication (3 min)

**Option A: Google SSO (recommended for internal teams)**
1. In Supabase → **Authentication → Providers → Google**
2. Toggle ON
3. You'll need a Google OAuth Client ID — follow [Supabase's guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
4. Set the redirect URL to `https://your-vercel-url.vercel.app/auth/callback`

**Option B: Email/Password (simpler to start)**
1. In Supabase → **Authentication → Providers → Email**
2. It's enabled by default
3. Optionally, restrict signups by going to **Auth → Settings → Disable email confirmations** for internal use

### Step 4: Clone & Configure Project (5 min)

```bash
# Clone the repository (or download from the provided files)
git clone <your-repo-url>
cd mural-pricing-engine

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your Supabase credentials
```

Your `.env.local` should contain:
```
NEXT_PUBLIC_SUPABASE_URL=https://xyzxyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...your-anthropic-key (for protocol extraction)
```

### Step 5: Deploy to Vercel (5 min)

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign up (free)
3. Click **"Add New → Project"**
4. Import your GitHub repo
5. Vercel auto-detects Next.js — leave defaults
6. Add environment variables (same as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
7. Click **"Deploy"**

You'll get a URL like `https://mural-pricing.vercel.app` — share this with your team.

### Step 6: Invite Team Members (2 min)

1. Go to Supabase → **Authentication → Users**
2. Click **"Invite user"** and enter each team member's email
3. They'll receive an invite email with a link to set their password

OR with Google SSO, just share the URL — anyone with a `@muralhealth.com` Google account can sign in.

---

## Project Structure

```
mural-pricing-engine/
├── .env.example                 # Environment variable template
├── .env.local                   # Your secrets (never commit this)
├── next.config.js               # Next.js configuration
├── package.json                 # Dependencies
├── tailwind.config.js           # Tailwind CSS config
├── postcss.config.js            # PostCSS config
│
├── supabase/
│   └── schema.sql               # Database schema + seed data
│
├── src/
│   ├── lib/
│   │   ├── supabase-client.js   # Browser Supabase client
│   │   ├── supabase-server.js   # Server Supabase client
│   │   └── pricing.js           # Pricing calculation engine
│   │
│   ├── app/
│   │   ├── layout.js            # Root layout with auth provider
│   │   ├── page.js              # Dashboard (proposal list)
│   │   ├── login/
│   │   │   └── page.js          # Login page
│   │   ├── auth/
│   │   │   └── callback/
│   │   │       └── route.js     # OAuth callback handler
│   │   ├── proposals/
│   │   │   ├── page.js          # Proposal list
│   │   │   ├── new/
│   │   │   │   └── page.js      # New proposal
│   │   │   └── [id]/
│   │   │       └── page.js      # Edit proposal
│   │   ├── admin/
│   │   │   ├── rate-card/
│   │   │   │   └── page.js      # Rate card editor
│   │   │   └── discounts/
│   │   │       └── page.js      # Volume discount editor
│   │   └── api/
│   │       ├── proposals/
│   │       │   └── route.js     # Proposal CRUD API
│   │       ├── rate-card/
│   │       │   └── route.js     # Rate card API
│   │       └── extract/
│   │           └── route.js     # Protocol extraction API
│   │
│   └── components/
│       ├── TopBar.js             # Navigation header
│       ├── ProposalCard.js       # Dashboard card
│       ├── ProposalEditor.js     # Main editor layout
│       ├── StudyInputs.js        # Study profile form
│       ├── AddOns.js             # Concierge/PK toggles
│       ├── KPITiles.js           # Setup/Monthly/TCV tiles
│       ├── AssumptionsPanel.js   # Computed assumptions
│       ├── UnitPricesPanel.js    # Unit price display
│       ├── InternalView.js       # Fee breakdown
│       ├── CustomerView.js       # Customer-facing summary
│       ├── ProposalView.js       # Formatted proposal output
│       ├── NotesPanel.js         # Internal notes
│       ├── ProtocolExtractor.js  # AI protocol upload
│       └── Toggle.js             # Toggle component
│
└── public/
    └── favicon.ico
```

---

## Database Schema

See `supabase/schema.sql` for the full SQL. Key tables:

**`rate_cards`** — Unit prices (Standard + BMS schedules)
- Editable via Admin UI by non-technical users
- Changes take effect immediately for new calculations
- Audit trail via `updated_at` and `updated_by`

**`volume_discounts`** — Tiered discount schedules
- Categories: Countries, Sites, Patients, Screen Fails
- Min/max thresholds with discount rates

**`proposals`** — All proposal data
- Study parameters stored as JSONB for flexibility
- Status tracking (Draft → Submitted → Negotiating → Won/Lost)
- Notes with `include_in_proposal` flag
- Links to user who created/modified

**`proposal_versions`** — Full audit trail
- Snapshot of every save
- Who changed what, when

**`profiles`** — User profiles
- Name, email, role (admin, sales, viewer)
- Auto-created on first login

---

## Key Files to Create

I've provided the following files:
1. `supabase/schema.sql` — Full database schema with seed data
2. `src/lib/pricing.js` — Pricing calculation engine (extracted, testable)
3. `package.json` — All dependencies
4. `.env.example` — Environment variable template

Your engineering team will build out the Next.js pages and components from the React component library already established in the `.jsx` prototype.

---

## Admin: Updating Rate Cards

Non-technical users can update prices through the Admin panel:

1. Log in to the app
2. Click **Admin → Rate Card** in the navigation
3. Edit any price inline
4. Click **Save** — changes take effect immediately

Rate card changes are logged (who changed what, when) for audit purposes.

---

## Roadmap

**Phase 1 (Now):** Core pricing engine with auth, DB, and team access
**Phase 2:** Google Sheets sync for rate card management
**Phase 3:** Proposal PDF/DOCX generation
**Phase 4:** COGS & margin analysis
**Phase 5:** Partner/customer portal with role-based access
**Phase 6:** CRM integration (Salesforce/HubSpot)

---

## Cost Estimates

| Service | Free Tier | When You'd Pay |
|---|---|---|
| Supabase | 500MB DB, 50K auth users, 1GB storage | Very unlikely for internal tool |
| Vercel | 100GB bandwidth, unlimited deploys | Very unlikely for internal tool |
| Anthropic API | Pay per use (~$0.01-0.05 per protocol extraction) | Only when using protocol extraction |

**Estimated cost for a team of 20: $0–3/month** (API costs only, if using protocol extraction)
