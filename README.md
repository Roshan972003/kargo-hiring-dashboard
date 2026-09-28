# Kargo Hiring Dashboard

Implements the "Case 2 · Hiring Dashboard" components map: upload a resume, pick the
applied role (PM / Senior PM), score it against the rubric, generate an interview brief
and a draft outreach email, and send it with one click.

## Flow (matches the components map)

1. **Founder** uploads a CV (PDF/DOCX/TXT) and selects the applied role.
2. **Backend** (`app.py`) extracts text from the file and redacts the candidate's name,
   email, phone, and LinkedIn URL *before* anything is sent to the AI model
   (`redact.py`) — this is the "excludes personal details from AI" step in the map.
3. **Backend** sends the redacted resume + the full rubric (`rubric.py`) to Gemini
   (`ai.py`), which returns extracted info, a 1–4 score with rationale for each of
   Pillars 1–5, and a Pillar 6 gate assessment.
4. **Backend** computes the weighted composite score and recommendation band
   deterministically (`rubric.compute_composite` / `decide_band`) — the model's
   arithmetic is never trusted for this.
5. **Gemini** drafts an interview brief and a personalized invite/rejection email
   (using a `[CANDIDATE_NAME]` placeholder); the backend substitutes the real name back
   in only after scoring is done.
6. **Founder** reviews the ranked dashboard, edits the draft email if needed, and clicks
   Send — the backend sends it via **Resend**.

Candidates are persisted in **Neon Postgres** (`store.py`, a single JSONB table) — no
local database setup required, works the same in dev and once deployed.

## Setup

```bash
cd kargo-hiring-dashboard
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in GEMINI_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL, DATABASE_URL in .env
python app.py
```

Then open http://localhost:5002. Or use `./run.sh` once `venv` is set up.

### Environment variables

- `GEMINI_API_KEY` — required. Get one from Google AI Studio.
- `GEMINI_MODEL` — optional, defaults to `gemini-3.8-flash`.
- `DATABASE_URL` — required. A Neon Postgres connection string
  (`postgresql://user:pass@host/db?sslmode=require`). The `candidates` table is
  created automatically on first use.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — optional for now. Without them, everything
  works except clicking Send, which returns a clear error instead of sending. Add them
  later (a Resend API key + a verified sender, e.g. `"Kargo Hiring <hiring@yourdomain.com>"`)
  to enable real outreach.

## Deploying on Vercel

The app is set up to deploy as-is:

- `api/index.py` exposes the Flask `app` as the WSGI entrypoint Vercel's Python
  runtime looks for.
- `vercel.json` routes every request to that function and raises its timeout to 60s
  (resume scoring makes two sequential Gemini calls, which can take a few seconds).
- Candidate storage is already Neon Postgres, so there's no local filesystem
  dependency that would break in a serverless environment.
- Upload size is capped at 4MB (`app.py`) to stay under Vercel's ~4.5MB request body
  limit for Serverless Functions.

Steps:

1. Push this repo to GitHub (already done if you're reading this from there).
2. In the Vercel dashboard: **Add New → Project**, import the repo. Vercel will
   detect `vercel.json` and use the Python builder automatically — no framework
   preset needed.
3. Add environment variables under **Project Settings → Environment Variables**:
   `GEMINI_API_KEY`, `GEMINI_MODEL` (optional), `DATABASE_URL`, and later
   `RESEND_API_KEY` / `RESEND_FROM_EMAIL` once you're ready to send real email.
4. Deploy. Your Neon database is already cloud-hosted, so the same `DATABASE_URL`
   works in both local dev and the deployed app — candidates persist across both.

## Notes / limitations

- PII redaction (`redact.py`) is heuristic (regex + first-line-as-name), not a
  compliance-grade PII scrubber — good enough for a single-user internal tool, not a
  guarantee against leakage on unusual resume formats.
- The AI's raw pillar scores are trusted, but the composite score, cutoff band, and
  decision label are always computed in code from the rubric's stated weights — the
  model never does that arithmetic.
- Free-tier Gemini API keys have daily/per-minute quotas; if `/api/evaluate` starts
  returning 429s, either wait for the quota to reset or use a paid key.
- Resend isn't configured yet — sending is stubbed out until `RESEND_API_KEY` and
  `RESEND_FROM_EMAIL` are added, everything else (scoring, ranking, drafts) works
  without it.
- Resume uploads are capped at 4MB to fit Vercel's Serverless Function request body
  limit; large scanned PDFs may need to be compressed first.
