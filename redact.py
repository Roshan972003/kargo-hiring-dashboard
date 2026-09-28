import re

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
LINKEDIN_RE = re.compile(r"(https?://)?(www\.)?linkedin\.com/\S+", re.IGNORECASE)
NAME_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z .'\-]+$")


def redact_resume(raw_text):
    """
    Heuristic PII scrub so the raw resume text never reaches the scoring model.
    Not a compliance-grade redactor - good enough to keep name/email/phone out
    of the AI prompt for a single-user internal tool, not a guarantee no PII leaks.
    """
    email_match = EMAIL_RE.search(raw_text)
    candidate_email = email_match.group(0) if email_match else None

    candidate_name = None
    for line in raw_text.split("\n"):
        line = line.strip()
        if line and len(line) < 60 and not EMAIL_RE.search(line) and NAME_LINE_RE.match(line):
            candidate_name = line
            break

    sanitized = EMAIL_RE.sub("[EMAIL]", raw_text)
    sanitized = PHONE_RE.sub("[PHONE]", sanitized)
    sanitized = LINKEDIN_RE.sub("[LINKEDIN]", sanitized)

    if candidate_name:
        sanitized = re.sub(re.escape(candidate_name), "[NAME]", sanitized, flags=re.IGNORECASE)

    return {
        "sanitized_text": sanitized,
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
    }
