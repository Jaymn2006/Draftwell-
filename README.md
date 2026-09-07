# Draftwell

Draftwell is an offline-first voice-to-novel studio for writers who think out loud. It uses local browser storage and the Web Speech API when available. When Supabase is configured, drafts and settings can also be synchronized to cloud storage.

## Run

```bash
npm install
npm run dev
```

The browser speech recognition API is supported best in Chromium-based browsers. The app remains useful without it: type directly in the manuscript, and the microphone button explains when dictation is unavailable.

## Enable Supabase cloud storage

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**, enable **Anonymous sign-ins**.
3. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
4. Copy [`.env.example`](.env.example) to `.env.local` and add the project URL and anon public key.
5. Restart the development server.

```powershell
Copy-Item .env.example .env.local
npm run dev
```

The Save button writes locally first, then synchronizes the project and chapters to Supabase. If Supabase is unavailable or not configured, Draftwell remains fully usable offline.
