import re

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
LINKEDIN_RE = re.compile(r"(https?://)?(www\.)?linkedin\.com/\S+", re.IGNORECASE)
NAME_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z .'\-]+$")

# Fallback for lines like "Priya Sharma | priya@email.com | +91 98765" or
# resumes where PDF extraction leaves stray icon glyphs around the name -
# finds a 2-4 title-case-word run anywhere in a line, not just a line that
# is *only* a name.
NAME_RUN_RE = re.compile(r"[A-Z][a-zA-Z.'\-]*(?:\s+[A-Z][a-zA-Z.'\-]*){1,3}")

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
    "core", "competencies", "competency",
}

# Job-title words that show up as the first short line on resumes with an
# unconventional header layout (e.g. the title precedes the name).
TITLE_WORDS = {
    "manager", "associate", "engineer", "developer", "analyst", "intern",
    "director", "officer", "executive", "consultant", "specialist",
    "coordinator", "product", "senior", "junior", "lead", "leader", "head",
    "vp", "president", "founder", "ceo", "cto", "cpo", "coo", "operations",
    "strategist", "strategy", "brand",
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


def _has_contact_signal(line):
    return bool(EMAIL_RE.search(line) or PHONE_RE.search(line) or LINKEDIN_RE.search(line))


STRICT_NAME_RE = re.compile(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}")


def _find_duplicated_name(text):
    """
    Last-resort, whole-document search for a specific PDF-extraction
    artifact: some resume templates render the candidate's name twice (a
    large caps heading plus a normal-case subtitle), and pypdf glues the
    two together with no separator when it flattens a multi-column or
    sidebar layout - "PRIYA SHARMAPriya Sharma" or reversed "Ravi
    KumarRAVI KUMAR" - often dozens of lines past the top-of-resume search
    window, because pypdf's extraction order doesn't follow visual layout
    for these templates.

    This only fires as a last resort (the line-based checks above handle
    the normal case) and only matches when a strict title-case run (never
    true of an all-caps header like "EDUCATION" or "CORE COMPETENCIES",
    since those have no lowercase letters for [A-Z][a-z]+ to match) has
    its own all-caps duplicate immediately before or after it - a
    deliberately narrow, high-confidence signal so it doesn't start
    picking up ordinary multi-word proper nouns from the resume body.
    """
    for match in STRICT_NAME_RE.finditer(text):
        candidate = match.group(0)
        if not _looks_like_name(candidate):
            continue

        upper_compact = candidate.upper().replace(" ", "")
        pad = len(upper_compact) + 4
        start, end = match.start(), match.end()
        before = text[max(0, start - pad):start].upper().replace(" ", "").replace("\n", "")
        after = text[end:end + pad].upper().replace(" ", "").replace("\n", "")

        if upper_compact in before or upper_compact in after:
            return candidate

    return None


def _extract_name_from_line(line):
    """
    Try the line as a whole first (the common case: the name is on its own
    line, or is the whole content of a "Name | email | phone" style header
    line that still happens to pass the strict check). If that fails AND the
    line actually carries contact info (email/phone/LinkedIn), fall back to
    searching for an embedded 2-4 title-case-word run - this is deliberately
    *not* applied to plain lines with no contact signal, otherwise job-title
    or section-heading phrases elsewhere on the page ("Operations Leader",
    "Brand Strategy") get mistaken for the name.
    """
    if NAME_LINE_RE.match(line) and _looks_like_name(line):
        return line

    if not _has_contact_signal(line):
        return None

    for match in NAME_RUN_RE.finditer(line):
        candidate = match.group(0).strip()
        if _looks_like_name(candidate):
            return candidate

    return None


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
        if not line or len(line) > 150:
            continue
        name = _extract_name_from_line(line)
        if name:
            candidate_name = name
            break

    if not candidate_name:
        candidate_name = _find_duplicated_name(raw_text)

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
