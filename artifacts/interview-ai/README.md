# InterviewAI setup

## Connect Supabase

1. Create or choose a Supabase project.
2. In Replit, add these project environment variables:
   - `SUPABASE_URL` — the project URL.
   - `SUPABASE_ANON_KEY` — the public anon/publishable key.
3. Do not add a Supabase service-role key. The API uses the signed-in user's session and each table enforces row-level security.
4. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql).
5. In Supabase Auth settings, enable email/password sign-in and set the app URL and redirect URLs to the published app URL. Email confirmation can be enabled; new users then confirm by email before signing in.

## AI feedback

Set `OPENAI_API_KEY` in Replit Secrets. It is used only by the API server and is never sent to the browser. If the key is missing or an AI request fails, the interview is explicitly labeled as demo feedback.

## Local development

The API server and web app are separate workspace workflows. Start both configured workflows to preview the app. Until Supabase is configured and the SQL is applied, authentication and saved interview actions return a clear setup error rather than sample records.
