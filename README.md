# Conneen AI Astro Chat Starter

A lightweight Astro starter for an AI consulting website with a binary-grid intro animation and a server-side OpenAI consultation chat endpoint.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and add your OpenAI API key
npm run dev
```

Open http://localhost:4321.

## Local Scout evaluation loop

The project includes a local, no-UI evaluation harness that runs a simulated customer conversation against Scout's backend and asks a third AI to grade Scout's usefulness, gaps, personality, and missing agentic abilities.

Run it with two terminals:

```bash
npm run dev
```

Then, in a second terminal:

```bash
npm run evaluate:scout
```

Reports are saved as timestamped Markdown files in `scout-evals/`, for example `scout-evals/scout-eval-2026-05-18T...md`.

Optional environment variables:

- `SCOUT_EVAL_CHATBOT_URL` - defaults to `http://localhost:4321/api/chat`
- `SCOUT_EVAL_TURNS` - defaults to `8`
- `OPENAI_EVAL_MODEL` - defaults to `OPENAI_MODEL`, then `gpt-5-mini`

After making improvements to Scout, run `npm run evaluate:scout` again and compare the newest report with earlier files.

### Scout account-creation evaluation

To test whether Scout can turn a prospect conversation into an inspectable client portal account, run the account provisioning evaluator:

```bash
npm run dev
```

Then, in a second terminal:

```bash
npm run evaluate:scout-account
```

The script has an AI prospect talk to Scout, submits the resulting inquiry through the normal lead endpoint, accepts the generated portal invite with a generated password, fetches a portal inventory, and grades both the conversation and the account contents. Reports are saved in `scout-account-evals/` and include a portal username/password for manual inspection.

For the richest workspace population, run the local server with `OPENAI_API_KEY` plus Supabase service-role credentials. AI provisioning is enabled by default when an OpenAI key is present; set `PORTAL_PROVISION_WITH_AI=false` only when you intentionally want the smaller fallback workspace.

Optional environment variables:

- `SCOUT_ACCOUNT_EVAL_BASE_URL` - defaults to `http://localhost:4321`
- `SCOUT_ACCOUNT_EVAL_TURNS` - defaults to `9`
- `OPENAI_EVAL_MODEL` - defaults to `OPENAI_MODEL`, then `gpt-5-mini`

## Client portal

The client portal login lives at `/portal`. After a successful login, users are sent to `/portal/dashboard`.

Setup:

1. Run `supabase/client_portal.sql` in the Supabase SQL editor.
2. Confirm these environment variables are set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`, for portal Scout/RAG helpers
   - `PORTAL_BOOTSTRAP_SECRET`, for creating the first admin
3. Create the first admin with a POST to `/api/portal/bootstrap-admin`:

```json
{
  "secret": "your bootstrap secret",
  "email": "you@example.com",
  "password": "at least 12 characters",
  "displayName": "Your Name"
}
```

Portal code is split for debugging:

- `src/pages/portal.astro` - login page route
- `src/pages/portal/dashboard.astro` - authenticated portal route
- `src/components/portal/PortalApp.astro` - login/auth shell
- `src/components/portal/PortalDashboard.astro` - authenticated portal shell
- `public/scripts/client-portal.js` - browser behavior
- `public/styles/client-portal.css` - portal UI styles
- `src/lib/portal/` - auth, Supabase REST, analytics, records, storage, AI helpers
- `src/pages/api/portal/` - route-specific portal APIs
- `supabase/client_portal.sql` - database, storage bucket, RLS baseline, and RAG-ready tables

Lead-to-portal provisioning:

- When a user submits a Scout inquiry, `/api/leads` now creates a client workspace, client owner invite, original Scout transcript, business knowledge, workflow/project records, milestones, draft estimates, initial meetings, user stories, work items/tasks, data requests, open questions, metrics/risks where available, and custom setup tour steps.
- Portal Scout uses all registered portal sections as context through `src/lib/portal/ai.ts`.
- Client invite email delivery requires `RESEND_API_KEY` and `LEAD_FROM_EMAIL`. Without those, the app returns/displays a local invite link for testing.
- If you already ran the portal SQL before this feature existed, re-run `supabase/client_portal.sql` so `portal_tour_steps` is created.

Meeting automation:

- Support scheduling creates a `portal_calendar_events` record and, when Zoom is configured, creates a Zoom meeting link automatically.
- Set `MEETING_PROVIDER=zoom`, `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, and optionally `ZOOM_USER_ID` for Zoom server-to-server OAuth.
- For local bot testing, add Meeting SDK credentials too: `ZOOM_MEETING_SDK_CLIENT_ID`, `ZOOM_MEETING_SDK_CLIENT_SECRET`, and `ZOOM_BOT_NAME=Scout`.
- For easier local bot entry, set `ZOOM_WAITING_ROOM=false`. Keep it enabled in production unless you intentionally want guests and Scout to enter without admission.
- The Scout browser bot uses `SCOUT_ZOOM_BOT_SDK_VERSION=4.0.0` by default and falls back across Zoom/npm CDN URLs if the first SDK bundle fails to load.
- `SCOUT_MEETING_WEBHOOK_SECRET` lets a live transcript service post transcript chunks to `/api/portal/meeting-scout` with the `x-scout-meeting-secret` header.
- If Zoom is not configured, meetings still schedule normally and can use `PUBLIC_MEETING_FALLBACK_URL` as a temporary shared link.

To test meeting automation locally, start the dev server and then run:

```bash
npm run test:meeting
```

The test logs in, schedules the next free Alaska-time meeting slot, verifies the online meeting metadata, sends sample transcript chunks to Scout, and writes a report in `meeting-tests/`. Set `PORTAL_MEETING_TEST_EMAIL` and `PORTAL_MEETING_TEST_PASSWORD` in `.env` for the portal user the test should use. Admin users can optionally set `PORTAL_MEETING_TEST_CLIENT_NAME` or `PORTAL_MEETING_TEST_CLIENT_ID`.

To launch a real Zoom meeting and open a visible Scout Meeting SDK participant window, use:

```bash
npm run test:zoom-scout-voice
```

This creates a Zoom meeting, opens the host join link, opens `/zoom-scout-bot`, and starts an interactive transcript console. The Scout browser window auto-joins by default; admit Scout from the waiting room if needed. The bot page relays supported Zoom chat events into `/api/portal/meeting-scout` and posts Scout responses back to Zoom chat when the SDK exposes `sendChat`. Browser text-to-speech plays locally from the bot page; to make that audio audible in Zoom, route browser audio through a virtual microphone and select it as Scout's mic.

Zoom's current guidance is to use RTMS for AI meeting transcription/notetaking in production. The Meeting SDK bot window is useful for visible local testing and chat relay, while a production-grade live media pipeline should use RTMS for real-time transcript/audio access.

For the production voice-bot plan, see `docs/scout-zoom-production-voice-bot.md`. The repo includes:

- `npm run scout:voice-options` to generate sample Scout voice files with OpenAI TTS.
- `/api/portal/scout-voice` to synthesize Scout speech.
- `npm run scout:rtms` as a Linux/macOS RTMS listener scaffold for Zoom live transcripts/audio.

Note: Zoom's RTMS npm package does not support Windows. Run the RTMS listener on Linux/macOS or a deployment host.

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Add environment variables:
   - OPENAI_API_KEY
   - OPENAI_MODEL, optional, defaults in code
4. Deploy.

## Key files

- `src/pages/index.astro` - homepage shell
- `src/components/BinaryConsultant.astro` - binary canvas + chat UI
- `src/pages/api/chat.ts` - server-side OpenAI endpoint
- `src/data/companyKnowledge.ts` - editable company facts used by the consultant
