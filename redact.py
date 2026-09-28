import re

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
LINKEDIN_RE = re.compile(r"(https?://)?(www\.)?linkedin\.com/\S+", re.IGNORECASE)
NAME_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z .'\-]+$")

# Only look for the name in the top of the resume (header/contact block) -
# a capitalized multi-word phrase deep in the body is far more likely to be
# a project or company name than a person's name.
NAME_SEARCH_LINE_LIMIT = 15

# Resume section headers that are structurally indistinguishable from a
# short title-case/caps line (the old heuristic's failure mode: "EDUCATION",
# "PROFESSIONAL SUMMARY", "S U M M A R Y" letter-spaced headers all passed).
SECTION_HEADER_WORDS = {
    "education", "summary", "experience", "professional", "synopsis",
    "academic", "qualifications", "qualification", "scholastic",
    "achievements", "achievement", "research", "publications", "objective",
    "skills", "projects", "project", "certifications", "certification",
    "awards", "declaration", "references", "reference", "contact",
    "personal", "details", "career", "work", "technical", "languages",
    "interests", "hobbies", "profile", "employment", "history",
    "activities", "extracurricular", "volunteering", "training", "courses",
}

# Job-title words that show up as the first short line on resumes with an
# unconventional header layout (e.g. the title precedes the name).
TITLE_WORDS = {
    "manager", "associate", "engineer", "developer", "analyst", "intern",
    "director", "officer", "executive", "consultant", "specialist",
    "coordinator", "product", "senior", "junior", "lead", "head", "vp",
    "president", "founder", "ceo", "cto", "cpo", "coo",
}


def _looks_like_name(line):
    """
    Structural check for "is this line plausibly a person's name" - 2-4
    title-case words, none of them a resume section header or job title,
    no bare single-letter tokens (catches letter-spaced headers like
    "S U M M A R Y"), no lowercase leading word (catches sentence
    fragments).
    """
    words = line.split()
    if not (2 <= len(words) <= 4):
        return False

    for word in words:
        core = word.strip(".,'-")
        if not core:
            return False
        if len(core) < 2 and not word.endswith("."):
            return False
        if not core[0].isupper():
            return False
        lowered = core.lower()
        if lowered in SECTION_HEADER_WORDS or lowered in TITLE_WORDS:
            return False

    return True


def redact_resume(raw_text):
    """
    Heuristic PII scrub so the raw resume text never reaches the scoring model.
    Not a compliance-grade redactor - good enough to keep name/email/phone out
    of the AI prompt for a single-user internal tool, not a guarantee no PII leaks.
    """
    email_match = EMAIL_RE.search(raw_text)
    candidate_email = email_match.group(0) if email_match else None

    candidate_name = None
    lines = raw_text.split("\n")
    for line in lines[:NAME_SEARCH_LINE_LIMIT]:
        line = line.strip()
        if (
            line
            and len(line) < 60
            and not EMAIL_RE.search(line)
            and NAME_LINE_RE.match(line)
            and _looks_like_name(line)
        ):
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
