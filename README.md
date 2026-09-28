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
- `RESEND_API_KEY` — required to send email. Get one from resend.com.
- `RESEND_FROM_EMAIL` — required. Must be a verified sender/domain in your Resend
  account, e.g. `"Kargo Hiring <hiring@yourdomain.com>"`.
- `DATABASE_URL` — required. A Neon Postgres connection string
  (`postgresql://user:pass@host/db?sslmode=require`). The `candidates` table is
  created automatically on first use.

## Notes / limitations

- PII redaction (`redact.py`) is heuristic (regex + first-line-as-name), not a
  compliance-grade PII scrubber — good enough for a single-user internal tool, not a
  guarantee against leakage on unusual resume formats.
- The AI's raw pillar scores are trusted, but the composite score, cutoff band, and
  decision label are always computed in code from the rubric's stated weights — the
  model never does that arithmetic.
- Free-tier Gemini API keys have daily/per-minute quotas; if `/api/evaluate` starts
  returning 429s, either wait for the quota to reset or use a paid key.
