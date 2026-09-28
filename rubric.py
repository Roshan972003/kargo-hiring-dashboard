PILLAR_IDS = ["p1", "p2", "p3", "p4", "p5"]

PILLAR_NAMES = {
    "p1": "Product Execution & Shipping Discipline",
    "p2": "Domain Fluency (Freight, Logistics & Operations)",
    "p3": "Comfort with Ambiguity & Zero-to-One Building",
    "p4": "Cross-Functional Collaboration & Stakeholder Management",
    "p5": "Architectural / Platform Judgment",
}

WEIGHTS = {
    "PM": {"p1": 0.25, "p2": 0.25, "p3": 0.25, "p4": 0.20, "p5": 0.05},
    "SPM": {"p1": 0.20, "p2": 0.20, "p3": 0.25, "p4": 0.20, "p5": 0.15},
}

DECISION_LABELS = {
    "do_not_proceed": "Do not proceed",
    "proceed_if_ambiguity_strong": "Borderline — proceed only on ambiguity strength",
    "strong_proceed": "Strong candidate — proceed to final round",
    "fast_track": "Exceptional — fast-track to founder conversation",
}


def compute_composite(pillar_scores, role):
    weights = WEIGHTS[role]
    total = sum(pillar_scores[p]["score"] * weights[p] for p in PILLAR_IDS)
    return round(total, 2)


def decide_band(composite, p3_score, gate_status):
    if composite < 2.2:
        decision = "do_not_proceed"
    elif composite <= 2.7:
        decision = "proceed_if_ambiguity_strong" if p3_score >= 3 else "do_not_proceed"
    elif composite <= 3.3:
        decision = "strong_proceed"
    else:
        decision = "fast_track"

    # A Pillar 6 flag never hard-blocks, but it should never let a borderline
    # case skip straight to fast-track without a human looking at it first.
    if gate_status == "flag" and decision == "fast_track":
        decision = "strong_proceed"

    return decision


RUBRIC_TEXT = """
CANDIDATE EVALUATION RUBRIC
ROLE: PRODUCT MANAGER / SENIOR PRODUCT MANAGER - KARGO (SERIES A, FREIGHT-TECH)

Six pillars. Pillars 1-4 apply to both PM and Senior PM. Pillar 5 weighting shifts
materially upward for Senior PM. Pillar 6 is a fit/risk gate, not a scored competency.

PILLAR 1: PRODUCT EXECUTION AND SHIPPING DISCIPLINE
Assessed: end-to-end feature ownership; discovery rigor (qualitative + quantitative);
willingness to kill features, not just ship them; roadmap/prioritization reasoning.
1 - Below Expectations: involvement without own decision logic; no post-launch measurement; never killed/deprioritized anything.
2 - Meets Minimum: shipped end-to-end under senior guidance; informal/undocumented discovery; prioritization discussed only in the abstract.
3 - Proficient: owns spec-to-release-to-post-launch independently; cites specific discovery methods tied to shipped outcomes.
4 - Exceptional: track record of shipping AND killing features based on evidence, reasoning documented and shared; reallocates capacity toward what works without waiting for permission.

PILLAR 2: DOMAIN FLUENCY - FREIGHT, LOGISTICS, AND OPERATIONS GROUND TRUTH
Assessed: direct exposure to freight forwarding, customs, port, or 3PL operations;
depth of understanding of operational failure points; evidence of being "in the room" with ops, not just on calls.
1 - Below Expectations: no exposure to logistics/freight/ops-heavy environments; theoretical/secondhand only.
2 - Meets Minimum: logistics-adjacent B2B SaaS exposure (e.g. supply chain visibility, fulfilment) but not freight forwarding specifically.
3 - Proficient: direct hands-on experience with freight/logistics documentation, customs, or carrier coordination; speaks concretely to what breaks operationally and why.
4 - Exceptional: domain fluency built through direct operational work, converted into product/technical judgment; independently built a tool/process to solve an operational gap they personally experienced.

PILLAR 3: COMFORT WITH AMBIGUITY AND ZERO-TO-ONE BUILDING
Assessed: operating without an existing playbook/template/senior layer above them;
history of building process/structure from scratch; making calls and living with the outcome, without escalation.
1 - Below Expectations: only structured, mature-process environments; wants clarity/direction before acting, no example of building structure themselves.
2 - Meets Minimum: some autonomy but always within an existing framework (existing PRD templates, sprint process, design system).
3 - Proficient: has built a process/tool/framework from nothing because it did not exist and was needed; comfortable being the only person making a category of decision.
4 - Exceptional: first person in their function at the company, or acts like it — no handbook, no design system, treats that as the job; explicit third-party evidence of trusted, low-hedge decision-making.

PILLAR 4: CROSS-FUNCTIONAL COLLABORATION AND STAKEHOLDER MANAGEMENT
Assessed: working directly with engineering without a buffer layer; managing upward (founder/CTO-level); managing lateral tension (sales vs engineering vs CS).
1 - Below Expectations: collaboration described only in generic terms; no evidence of resolving a real disagreement/trade-off between functions.
2 - Meets Minimum: presented to senior stakeholders but in a supporting/reporting capacity; coordinates reactively.
3 - Proficient: regularly presents roadmap/strategy directly to founder or C-level; manages competing priorities across functions as normal part of the role.
4 - Exceptional: works with engineering directly on what gets built and why, no product layer as intermediary; has changed how a cross-functional team operates as a result of their presence.

PILLAR 5: ARCHITECTURAL / PLATFORM JUDGMENT
(Lightly weighted for PM; a primary differentiator for Senior PM.)
Assessed: understanding of integration layers, data reliability, technical trade-offs;
ability to draw a defensible line between "build," "configure," and "do not touch"; reliability/data-quality ownership.
1 - Below Expectations: no exposure to integration/data architecture/platform trade-offs; treats all technical requests as equally prioritizable.
2 - Meets Minimum: adjacent to integrations/data pipelines but as a requirements-writer, not a decision-maker on the trade-off itself.
3 - Proficient: has made or strongly influenced a real build-vs-configure-vs-avoid call, with a stated rationale.
4 - Exceptional: owns reliability/data-quality standards as a first-class product responsibility, with quantified consequences of getting it wrong.

PILLAR 6: RISK / FIT GATE - STRUCTURED-ENVIRONMENT DEPENDENCY (gate, not scored numerically)
Flag (requires probing in interview, not a hard reject) if: career history exclusively at 100+ employee companies with existing PM/design/process functions;
describes PM work as executing within a system rather than creating one; no individually attributable example of building a process/tool/standard that did not exist before them.
Clear if: at least one unambiguous example of building something from nothing under their own initiative, named without hedging it as "informal" or "just something I did".

WEIGHTED SCORING GUIDANCE
PM: Pillar1 25%, Pillar2 25%, Pillar3 25%, Pillar4 20%, Pillar5 5%. Pillar6 is a gate, not scored numerically.
Senior PM: Pillar1 20%, Pillar2 20%, Pillar3 25%, Pillar4 20%, Pillar5 15%. Pillar6 is a gate, not scored numerically.

Recommended cutoffs:
- Composite below 2.2: Do not proceed
- Composite 2.2-2.7: Proceed only if Pillar 3 individually scores 3 or above
- Composite 2.8-3.3: Strong candidate, proceed to final round
- Composite above 3.3: Exceptional, fast-track to founder conversation
""".strip()
