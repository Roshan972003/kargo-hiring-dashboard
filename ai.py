import json
import os
import re

import google.generativeai as genai

from rubric import RUBRIC_TEXT, DECISION_LABELS

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")


class AIError(Exception):
    pass


def _get_model():
    if not GEMINI_API_KEY:
        raise AIError("Missing GEMINI_API_KEY. Add it to your .env file and restart the server.")
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel(GEMINI_MODEL)


def _parse_json(text):
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        raise AIError("The model returned a response that could not be parsed as JSON. Please try again.")


def _call(prompt):
    model = _get_model()
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.3,
            ),
            request_options={"timeout": 60},
        )
    except Exception as exc:
        raise AIError(f"The request to Gemini failed: {exc}")

    text = getattr(response, "text", None)
    if not text:
        raise AIError("Gemini returned an empty response. Please try again.")

    return _parse_json(text)


SCORE_PROMPT = """You are a hiring panel analyst scoring a candidate against a fixed rubric for a {role_label} role at Kargo, a Series A freight-tech company.

The resume text below has had the candidate's name, email, phone, and LinkedIn URL
redacted (replaced with [NAME] / [EMAIL] / [PHONE] / [LINKEDIN]). Score based only on
the substance of their experience - do not attempt to guess or infer identity.

RUBRIC:
{rubric_text}

REDACTED RESUME TEXT:
\"\"\"
{resume_text}
\"\"\"

Return ONLY a JSON object with this exact shape (no prose, no markdown fences):
{{
  "extracted": {{
    "years_experience": number or null,
    "current_role": string or null,
    "key_skills": [string, ...],
    "summary": "2-3 sentence summary, no names"
  }},
  "pillar_scores": {{
    "p1": {{"score": 1|2|3|4, "rationale": string}},
    "p2": {{"score": 1|2|3|4, "rationale": string}},
    "p3": {{"score": 1|2|3|4, "rationale": string}},
    "p4": {{"score": 1|2|3|4, "rationale": string}},
    "p5": {{"score": 1|2|3|4, "rationale": string}}
  }},
  "gate": {{"status": "clear"|"flag", "rationale": string}},
  "interview_brief": {{
    "strengths": [string, ...],
    "risks_to_probe": [string, ...],
    "suggested_questions": [string, ...],
    "summary": string
  }}
}}

Score strictly against the rubric's rating anchors (1-4) for each pillar, citing concrete
evidence from the resume text in each rationale. If the resume gives no evidence for a
pillar, score it 1 or 2 and say so explicitly rather than assuming credit.
"""


def score_candidate(sanitized_resume_text, role):
    role_label = "Product Manager" if role == "PM" else "Senior Product Manager"
    prompt = SCORE_PROMPT.format(
        role_label=role_label, rubric_text=RUBRIC_TEXT, resume_text=sanitized_resume_text
    )
    data = _call(prompt)

    required = {"extracted", "pillar_scores", "gate", "interview_brief"}
    if not required.issubset(data.keys()):
        raise AIError("Gemini's scoring response was missing expected fields. Please try again.")

    return data


EMAIL_PROMPT = """Draft a short, warm, specific {kind} email from a hiring founder to a candidate for the {role_label} role at Kargo (a Series A freight-tech startup).

Decision: {decision_label}
Gate status: {gate_status}{gate_note}
Candidate strengths: {strengths}
Candidate summary: {summary}

Use the placeholder "[CANDIDATE_NAME]" wherever the candidate's name would go - do not
invent a name. Sign off as "The Kargo Hiring Team". Keep the body under 150 words, no
markdown, plain text only.

Return ONLY a JSON object: {{"subject": string, "body": string}}
"""


def draft_email(role, decision, gate_status, interview_brief):
    role_label = "Product Manager" if role == "PM" else "Senior Product Manager"
    is_invite = decision in ("strong_proceed", "fast_track")
    gate_note = (
        " (interview should probe comfort operating without existing process/scaffolding)"
        if gate_status == "flag"
        else ""
    )
    prompt = EMAIL_PROMPT.format(
        kind="interview invitation" if is_invite else "rejection",
        role_label=role_label,
        decision_label=DECISION_LABELS[decision],
        gate_status=gate_status,
        gate_note=gate_note,
        strengths="; ".join(interview_brief.get("strengths") or []) or "none noted",
        summary=interview_brief.get("summary", ""),
    )
    data = _call(prompt)

    if "subject" not in data or "body" not in data:
        raise AIError("Gemini's email response was missing expected fields. Please try again.")

    return data
