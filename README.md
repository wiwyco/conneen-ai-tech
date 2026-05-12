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
