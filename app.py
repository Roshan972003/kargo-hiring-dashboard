import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv

load_dotenv(override=True)

from flask import Flask, jsonify, render_template, request

from ai import AIError, draft_email, score_candidate
from parsing import ParseError, extract_text
from redact import redact_resume
from rubric import DECISION_LABELS, PILLAR_IDS, PILLAR_NAMES, WEIGHTS, compute_composite, decide_band
from store import add_candidate, delete_candidate, get_all_candidates, update_candidate

PORT = int(os.environ.get("PORT", 5002))
# Vercel's Serverless Functions cap request bodies at ~4.5MB regardless of this
# setting, so we stay under that rather than advertise a limit we can't honor.
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE + 256 * 1024


@app.route("/")
def index():
    meta = {
        "pillar_ids": PILLAR_IDS,
        "pillar_names": PILLAR_NAMES,
        "weights": WEIGHTS,
        "decision_labels": DECISION_LABELS,
    }
    return render_template("index.html", meta=meta)


@app.route("/api/evaluate", methods=["POST"])
def evaluate():
    if "file" not in request.files or request.files["file"].filename == "":
        return jsonify(error="No resume file uploaded."), 400

    role = request.form.get("role")
    if role not in ("PM", "SPM"):
        return jsonify(error='Role must be "PM" or "SPM".'), 400

    file = request.files["file"]
    filename = file.filename
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify(error=f"Unsupported file type '.{ext}'. Upload a PDF, DOCX, or TXT resume."), 400

    file_bytes = file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify(error="File is too large. Maximum size is 4MB."), 400
    if len(file_bytes) == 0:
        return jsonify(error="The uploaded file is empty."), 400

    try:
        raw_text = extract_text(file_bytes, filename)
    except ParseError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        return jsonify(error=f"Could not read this file: {exc}"), 400

    if not raw_text.strip():
        return jsonify(error="Could not extract any text from that file."), 422

    redacted = redact_resume(raw_text)

    try:
        scored = score_candidate(redacted["sanitized_text"], role)
    except AIError as exc:
        return jsonify(error=str(exc)), 502

    pillar_scores = scored["pillar_scores"]
    composite = compute_composite(pillar_scores, role)
    decision = decide_band(composite, pillar_scores["p3"]["score"], scored["gate"]["status"])

    try:
        email = draft_email(role, decision, scored["gate"]["status"], scored["interview_brief"])
    except AIError as exc:
        return jsonify(error=str(exc)), 502

    name = redacted["candidate_name"] or "Candidate"
    email_subject = email["subject"].replace("[CANDIDATE_NAME]", name)
    email_body = email["body"].replace("[CANDIDATE_NAME]", name)

    candidate = {
        "id": str(uuid.uuid4()),
        "name": name,
        "email": redacted["candidate_email"],
        "role": role,
        "file_name": filename,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "extracted": scored["extracted"],
        "pillar_scores": pillar_scores,
        "gate": scored["gate"],
        "composite_score": composite,
        "decision": decision,
        "interview_brief": scored["interview_brief"],
        "email_draft": {"subject": email_subject, "body": email_body},
        "email_sent": False,
        "email_sent_at": None,
    }

    add_candidate(candidate)
    return jsonify(candidate=candidate)


@app.route("/api/candidates")
def candidates():
    all_candidates = get_all_candidates()
    ranked = sorted(all_candidates, key=lambda c: c["composite_score"], reverse=True)
    return jsonify(candidates=ranked)


@app.route("/api/candidates/<candidate_id>", methods=["DELETE"])
def remove_candidate(candidate_id):
    deleted = delete_candidate(candidate_id)
    if not deleted:
        return jsonify(error="Candidate not found."), 404
    return jsonify(deleted=True)


@app.route("/api/send-email", methods=["POST"])
def send_email():
    payload = request.get_json(silent=True) or {}
    candidate_id = payload.get("candidate_id")
    to = payload.get("to")
    subject = payload.get("subject")
    body = payload.get("body")

    if not all([candidate_id, to, subject, body]):
        return jsonify(error="candidate_id, to, subject, and body are all required."), 400

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    from_email = os.environ.get("RESEND_FROM_EMAIL", "").strip()
    if not api_key or not from_email:
        return jsonify(
            error="RESEND_API_KEY and RESEND_FROM_EMAIL must be set in .env before sending."
        ), 500

    import resend

    resend.api_key = api_key
    try:
        resend.Emails.send(
            {"from": from_email, "to": [to], "subject": subject, "text": body}
        )
    except Exception as exc:
        return jsonify(error=f"Resend request failed: {exc}"), 502

    updated = update_candidate(
        candidate_id,
        {"email_sent": True, "email_sent_at": datetime.now(timezone.utc).isoformat()},
    )
    if updated is None:
        return jsonify(error="Candidate not found."), 404

    return jsonify(candidate=updated)


@app.errorhandler(413)
def too_large(_exc):
    return jsonify(error="File is too large. Maximum size is 4MB."), 413


@app.errorhandler(500)
def server_error(_exc):
    return jsonify(error="Something went wrong on the server. Please try again."), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
