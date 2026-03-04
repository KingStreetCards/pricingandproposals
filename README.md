# Mural Health Pricing Engine

Internal pricing calculator for Mural Link clinical trial services.

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Set up Supabase
#    - Create project at supabase.com
#    - Run supabase/schema.sql in SQL Editor
#    - Copy credentials to .env.local

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase URL and keys

# 4. Run locally
npm run dev
# Open http://localhost:3000

# 5. Deploy to Vercel
#    Push to GitHub → import in Vercel → add env vars → deploy
```

## Full Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for:
- Complete architecture diagram
- Step-by-step setup instructions
- Database schema details
- Project structure
- Deployment guide
- Roadmap

## Key Files

| File | Purpose |
|---|---|
| `supabase/schema.sql` | Database tables, RLS policies, seed data |
| `src/lib/pricing.js` | Pricing calculation engine (pure functions) |
| `src/lib/supabase-client.js` | Browser-side Supabase client |
| `src/lib/supabase-server.js` | Server-side Supabase client |
| `src/app/api/extract/route.js` | AI protocol extraction endpoint |
| `src/app/page.js` | Main page with auth |

## Stack

- **Frontend:** Next.js 14 (React)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (Google SSO + email/password)
- **Hosting:** Vercel
- **AI:** Anthropic Claude (protocol extraction)
