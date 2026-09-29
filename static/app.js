const META = JSON.parse(document.getElementById("rubric-meta").textContent);

const DECISION_BADGE_CLASS = {
  do_not_proceed: "badge-red",
  proceed_if_ambiguity_strong: "badge-amber",
  strong_proceed: "badge-green",
  fast_track: "badge-blue",
};

const DECISION_SHORT_LABELS = {
  do_not_proceed: "Do not proceed",
  proceed_if_ambiguity_strong: "Borderline",
  strong_proceed: "Strong proceed",
  fast_track: "Fast-track",
};

// Fixed colors for decision bands, in worst -> best order. Kept in sync with
// the .badge-red/-amber/-green/-blue classes used elsewhere.
const DECISION_COLORS = {
  do_not_proceed: "#f87171",
  proceed_if_ambiguity_strong: "#fbbf24",
  strong_proceed: "#34d399",
  fast_track: "#4f8ef7",
};

const uploadForm = document.getElementById("upload-form");
const uploadBtn = document.getElementById("upload-btn");
const uploadBtnLabel = document.getElementById("upload-btn-label");
const uploadError = document.getElementById("upload-error");
const resumeInput = document.getElementById("resume-input");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzone-title");
const roleInput = document.getElementById("role-input");
const roleSegmented = document.getElementById("role-segmented");
const uploadProgress = document.getElementById("upload-progress");
const uploadProgressFill = document.getElementById("upload-progress-fill");
const uploadProgressLabel = document.getElementById("upload-progress-label");

const DEFAULT_DROPZONE_TEXT = "Drop resumes here, or click to browse";

const gradingToggleRow = document.getElementById("grading-toggle-row");
const viewRoleSegmented = document.getElementById("view-role-segmented");
let viewRole = "PM";

const statsRow = document.getElementById("stats-row");
const statTotal = document.getElementById("stat-total");
const statFastTrack = document.getElementById("stat-fasttrack");
const statStrong = document.getElementById("stat-strong");
const statFlagged = document.getElementById("stat-flagged");

const candidatesWrap = document.getElementById("candidates-wrap");
const candidatesBody = document.getElementById("candidates-body");
const candidatesTable = document.getElementById("candidates-table");
const emptyState = document.getElementById("empty-state");
const loadingState = document.getElementById("loading-state");
const candidateCount = document.getElementById("candidate-count");

const overlay = document.getElementById("overlay");
const detailPanel = document.getElementById("detail-panel");

const toolbar = document.getElementById("toolbar");
const searchInput = document.getElementById("search-input");
const noResults = document.getElementById("no-results");
const noResultsQuery = document.getElementById("no-results-query");
const exportBtn = document.getElementById("export-btn");
const deleteAllBtn = document.getElementById("delete-all-btn");

const chartsRow = document.getElementById("charts-row");
const scoreChart = document.getElementById("score-chart");
const decisionChart = document.getElementById("decision-chart");

let candidates = [];

// --- Role segmented control ---

roleSegmented.addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-option");
  if (!btn) return;
  roleSegmented.querySelectorAll(".segmented-option").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  roleInput.value = btn.dataset.role;
});

// --- Grading role toggle: every candidate is graded for both roles from ---
// --- the same pillar scores, so switching just re-derives and re-renders. ---

viewRoleSegmented.addEventListener("click", (e) => {
  const btn = e.target.closest(".segmented-option");
  if (!btn || btn.dataset.role === viewRole) return;
  viewRoleSegmented.querySelectorAll(".segmented-option").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  viewRole = btn.dataset.role;
  renderTable();
  if (!overlay.classList.contains("hidden") && detailPanel.dataset.candidateId) {
    openDetail(detailPanel.dataset.candidateId);
  }
});

function grade(c) {
  return gradeFor(c, viewRole, META.weights);
}

// --- Dropzone ---

resumeInput.addEventListener("change", () => {
  updateDropzoneLabel();
});

function updateDropzoneLabel() {
  const files = resumeInput.files;
  if (!files || files.length === 0) {
    dropzoneTitle.textContent = DEFAULT_DROPZONE_TEXT;
    dropzone.classList.remove("has-file");
    uploadBtnLabel.textContent = "Score candidate";
    return;
  }
  if (files.length === 1) {
    dropzoneTitle.textContent = files[0].name;
    uploadBtnLabel.textContent = "Score candidate";
  } else {
    dropzoneTitle.textContent = `${files.length} resumes selected`;
    uploadBtnLabel.textContent = `Score ${files.length} candidates`;
  }
  dropzone.classList.add("has-file");
}

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  })
);

["dragleave", "dragend"].forEach((evt) =>
  dropzone.addEventListener(evt, () => dropzone.classList.remove("drag-over"))
);

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    resumeInput.files = e.dataTransfer.files;
    resumeInput.dispatchEvent(new Event("change"));
  }
});

// --- Data loading ---

async function loadCandidates() {
  try {
    const res = await fetch("/api/candidates");
    const data = await res.json();
    candidates = data.candidates || [];
  } finally {
    loadingState.classList.add("hidden");
  }
  renderTable();
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function experienceLine(c) {
  const yrs = c.extracted?.years_experience;
  const role = c.extracted?.current_role;
  const parts = [];
  if (typeof yrs === "number") parts.push(`${yrs} yr${yrs === 1 ? "" : "s"}`);
  if (role) parts.push(role);
  return parts.join(" · ");
}

function renderStats() {
  if (candidates.length === 0) {
    statsRow.classList.add("hidden");
    gradingToggleRow.classList.add("hidden");
    return;
  }
  statsRow.classList.remove("hidden");
  gradingToggleRow.classList.remove("hidden");
  statTotal.textContent = candidates.length;
  statFastTrack.textContent = candidates.filter((c) => grade(c).decision === "fast_track").length;
  statStrong.textContent = candidates.filter((c) => grade(c).decision === "strong_proceed").length;
  statFlagged.textContent = candidates.filter((c) => c.gate.status === "flag").length;
}

function getVisibleCandidates() {
  const q = searchInput.value.trim().toLowerCase();
  const filtered = q
    ? candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || (c.extracted?.current_role || "").toLowerCase().includes(q)
      )
    : candidates;
  return [...filtered].sort((a, b) => grade(b).composite - grade(a).composite);
}

function renderTable() {
  candidateCount.textContent = candidates.length ? `${candidates.length} scored` : "";
  renderStats();
  renderCharts();

  if (candidates.length === 0) {
    emptyState.classList.remove("hidden");
    noResults.classList.add("hidden");
    candidatesTable.classList.add("hidden");
    toolbar.classList.add("hidden");
    chartsRow.classList.add("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  toolbar.classList.remove("hidden");
  chartsRow.classList.remove("hidden");

  const visible = getVisibleCandidates();

  if (visible.length === 0) {
    candidatesTable.classList.add("hidden");
    noResults.classList.remove("hidden");
    noResultsQuery.textContent = searchInput.value.trim();
    return;
  }
  noResults.classList.add("hidden");
  candidatesTable.classList.remove("hidden");

  candidatesBody.innerHTML = "";
  visible.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.className = "row-enter";
    tr.style.animationDelay = `${Math.min(i, 12) * 0.03}s`;
    const g = grade(c);
    const pct = Math.min(100, Math.max(0, (g.composite / 4) * 100));
    const exp = experienceLine(c);
    tr.innerHTML = `
      <td>
        <div class="candidate-cell">
          <span class="rank">#${i + 1}</span>
          <span class="avatar">${initials(c.name)}</span>
          <div class="candidate-text">
            <span class="candidate-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
            ${exp ? `<span class="candidate-sub" title="${escapeHtml(exp)}">${escapeHtml(exp)}</span>` : ""}
          </div>
        </div>
      </td>
      <td>
        <div class="score-cell">
          <span class="score-value">${g.composite.toFixed(2)}</span>
          <span class="score-bar"><span class="score-bar-fill" data-width="${pct}%" style="width:0%"></span></span>
        </div>
      </td>
      <td>${gateBadge(c.gate.status)}</td>
      <td><span class="badge ${DECISION_BADGE_CLASS[g.decision]}" title="${escapeHtml(META.decision_labels[g.decision])}">${DECISION_SHORT_LABELS[g.decision]}</span></td>
      <td class="muted">${c.email_sent ? "Sent" : "Draft"}</td>
      <td class="row-actions">
        <a class="row-icon-btn" href="/candidate/${c.id}" target="_blank" rel="noopener" title="Open full page" aria-label="Open full page">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" /><path d="M10 14L21 3" />
          </svg>
        </a>
        <button class="row-icon-btn row-delete-btn" title="Delete candidate" aria-label="Delete candidate">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </td>
    `;
    tr.addEventListener("click", () => openDetail(c.id));
    tr.querySelectorAll(".row-icon-btn").forEach((btn) => btn.addEventListener("click", (e) => e.stopPropagation()));
    tr.querySelector(".row-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCandidate(c.id);
    });
    candidatesBody.appendChild(tr);
  });
  candidatesWrap.scrollLeft = 0;
  animateBars();
}

// Bars are rendered at width:0 with the real value in data-width, then
// nudged to their target on the next frame so the width transition
// actually plays instead of snapping straight to the final state.
function animateBars() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.querySelectorAll("[data-width]").forEach((el) => {
        el.style.width = el.dataset.width;
      });
    });
  });
}

searchInput.addEventListener("input", () => renderTable());

async function deleteCandidate(id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  const ok = await confirmDialog(
    "Delete candidate?",
    `Delete ${c.name} from the ranked candidates? This can't be undone.`
  );
  if (!ok) return;

  try {
    const res = await fetch(`/api/candidates/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed.");

    candidates = candidates.filter((x) => x.id !== id);
    renderTable();
    if (!overlay.classList.contains("hidden") && detailPanel.dataset.candidateId === id) {
      closeDetail();
    }
    showToast(`Deleted ${c.name}.`);
  } catch (err) {
    showToast(err.message);
  }
}

deleteAllBtn.addEventListener("click", async () => {
  if (candidates.length === 0) return;
  const ok = await confirmDialog(
    "Delete all candidates?",
    `This permanently deletes all ${candidates.length} ranked candidates. This can't be undone.`
  );
  if (!ok) return;

  try {
    const res = await fetch("/api/candidates", { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed.");

    candidates = [];
    renderTable();
    closeDetail();
    showToast("All candidates deleted.");
  } catch (err) {
    showToast(err.message);
  }
});

// --- CSV export ---

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

exportBtn.addEventListener("click", () => {
  const rows = getVisibleCandidates();
  if (rows.length === 0) return;

  const header = [
    "Name",
    "PM composite",
    "PM decision",
    "Senior PM composite",
    "Senior PM decision",
    "Gate",
    "Years experience",
    "Current role",
    "Email",
    "Email sent",
  ];
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((c) => {
    const pm = gradeFor(c, "PM", META.weights);
    const spm = gradeFor(c, "SPM", META.weights);
    lines.push(
      [
        c.name,
        pm.composite.toFixed(2),
        META.decision_labels[pm.decision],
        spm.composite.toFixed(2),
        META.decision_labels[spm.decision],
        c.gate.status,
        c.extracted?.years_experience ?? "",
        c.extracted?.current_role ?? "",
        c.email ?? "",
        c.email_sent ? "yes" : "no",
      ]
        .map(csvEscape)
        .join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kargo-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// --- Charts ---

function renderBarRow(label, value, max, color, valueText) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 3 : 0) : 0;
  return `
    <div class="bar-chart-row">
      <span class="bar-chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <span class="bar-chart-track"><span class="bar-chart-fill" data-width="${pct}%" style="width:0%;background:${color}"></span></span>
      <span class="bar-chart-value">${escapeHtml(valueText)}</span>
    </div>
  `;
}

function renderCharts() {
  if (candidates.length === 0) return;

  // Score comparison: one bar per candidate, sorted by composite score for
  // the currently selected grading role. Capped so the chart stays readable
  // once the list grows large.
  const SCORE_CHART_CAP = 12;
  const ranked = [...candidates].sort((a, b) => grade(b).composite - grade(a).composite);
  const shown = ranked.slice(0, SCORE_CHART_CAP);
  scoreChart.innerHTML = shown
    .map((c) => renderBarRow(c.name, grade(c).composite, 4, "var(--accent)", grade(c).composite.toFixed(2)))
    .join("");
  if (ranked.length > SCORE_CHART_CAP) {
    scoreChart.innerHTML += `<p class="bar-chart-empty">+ ${ranked.length - SCORE_CHART_CAP} more — see the table below</p>`;
  }

  // Decision breakdown: fixed worst -> best order, count per band.
  const order = ["do_not_proceed", "proceed_if_ambiguity_strong", "strong_proceed", "fast_track"];
  const counts = order.map((d) => candidates.filter((c) => grade(c).decision === d).length);
  const maxCount = Math.max(...counts, 1);
  decisionChart.innerHTML = order
    .map((d, i) => renderBarRow(DECISION_SHORT_LABELS[d], counts[i], maxCount, DECISION_COLORS[d], String(counts[i])))
    .join("");

  animateBars();
}

function gateBadge(status) {
  if (status === "flag") return `<span class="badge badge-amber">Flag — probe</span>`;
  return `<span class="badge badge-green">Clear</span>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Upload ---

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const files = Array.from(resumeInput.files || []);
  if (files.length === 0) return;

  uploadBtn.disabled = true;
  uploadError.classList.add("hidden");

  const role = roleInput.value;
  const errors = [];
  let lastSucceededId = null;

  if (files.length > 1) {
    uploadProgress.classList.remove("hidden");
    uploadProgressFill.style.width = "0%";
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    uploadBtnLabel.textContent =
      files.length > 1 ? `Scoring ${i + 1} of ${files.length}…` : "Scoring…";
    if (files.length > 1) {
      uploadProgressLabel.textContent = `${file.name} (${i + 1}/${files.length})`;
      uploadProgressFill.style.width = `${(i / files.length) * 100}%`;
    }

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("role", role);
      const res = await fetch("/api/evaluate", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Evaluation failed.");

      candidates.push(data.candidate);
      lastSucceededId = data.candidate.id;
      candidates.sort((a, b) => b.composite_score - a.composite_score);
      renderTable();
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }

    if (files.length > 1) {
      uploadProgressFill.style.width = `${((i + 1) / files.length) * 100}%`;
    }
  }

  if (errors.length > 0) {
    uploadError.textContent =
      errors.length === files.length
        ? `All uploads failed. ${errors[0]}`
        : `${errors.length} of ${files.length} failed: ${errors.join(" · ")}`;
    uploadError.classList.remove("hidden");
  }

  if (lastSucceededId) {
    openDetail(lastSucceededId);
  }

  uploadForm.reset();
  updateDropzoneLabel();
  roleSegmented.querySelectorAll(".segmented-option").forEach((b, i) => b.classList.toggle("active", i === 0));
  roleInput.value = "PM";
  uploadBtn.disabled = false;
  uploadBtnLabel.textContent = "Score candidate";
  uploadProgress.classList.add("hidden");
});

// --- Detail panel ---

function openDetail(id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  detailPanel.dataset.candidateId = id;
  detailPanel.innerHTML = renderDetail(c);
  overlay.classList.remove("hidden");

  detailPanel.querySelector(".close-btn").addEventListener("click", closeDetail);
  detailPanel.querySelector(".send-btn").addEventListener("click", () => sendEmail(c.id));
  detailPanel.querySelector(".detail-delete-btn").addEventListener("click", () => deleteCandidate(c.id));
  animateBars();
}

function closeDetail() {
  overlay.classList.add("hidden");
  detailPanel.innerHTML = "";
}

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDetail();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && confirmOverlay.classList.contains("hidden") && !overlay.classList.contains("hidden")) {
    closeDetail();
  }
});

function renderDetail(c) {
  const g = grade(c);
  const weights = META.weights[viewRole];
  const pillarRows = META.pillar_ids
    .map((p) => {
      const s = c.pillar_scores[p];
      return `
        <div class="pillar-box">
          <div class="pillar-row">
            <span class="pillar-name">${META.pillar_names[p]}</span>
            <span class="pillar-score">${s.score}/4 · ${Math.round(weights[p] * 100)}%</span>
          </div>
          <div class="pillar-bar-track"><div class="pillar-bar-fill" data-width="${(s.score / 4) * 100}%" style="width:0%"></div></div>
          <p>${escapeHtml(s.rationale)}</p>
        </div>
      `;
    })
    .join("");

  const brief = c.interview_brief;

  return `
    <div class="detail-header">
      <div class="detail-header-left">
        <span class="avatar" style="width:40px;height:40px;font-size:0.85rem">${initials(c.name)}</span>
        <div>
          <h3>${escapeHtml(c.name)}</h3>
          <p>Grading as ${viewRole === "PM" ? "Product Manager" : "Senior Product Manager"} · ${escapeHtml(c.file_name)}</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <a class="row-icon-btn" href="/candidate/${c.id}" target="_blank" rel="noopener" title="Open full page" aria-label="Open full page">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" /><path d="M10 14L21 3" />
          </svg>
        </a>
        <button class="row-icon-btn row-delete-btn detail-delete-btn" title="Delete candidate" aria-label="Delete candidate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
        <button class="close-btn">✕</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <p class="label">Composite score</p>
        <p class="value">${g.composite.toFixed(2)}</p>
      </div>
      <div class="stat-box">
        <p class="label">Decision</p>
        <p class="value small">${META.decision_labels[g.decision]}</p>
      </div>
    </div>

    <div class="gate-box ${c.gate.status === "flag" ? "flag" : "clear"}">
      <p class="label">Pillar 6 gate — structured-environment risk</p>
      <p class="gate-status" style="color: ${c.gate.status === "flag" ? "var(--amber)" : "var(--green)"}">
        ${c.gate.status === "flag" ? "Flag — probe in interview" : "Clear"}
      </p>
      <p class="muted">${escapeHtml(c.gate.rationale)}</p>
    </div>

    <p class="section-title">Pillar scores</p>
    ${pillarRows}

    <p class="section-title">Interview brief</p>
    <p class="brief-summary">${escapeHtml(brief.summary)}</p>
    ${briefBlock("Strengths", brief.strengths)}
    ${briefBlock("Risks to probe", brief.risks_to_probe)}
    ${briefBlock("Suggested questions", brief.suggested_questions)}

    <p class="section-title">Draft outreach email</p>
    <div class="email-form">
      <div class="email-field">
        <label>To</label>
        <input type="email" id="email-to" placeholder="candidate@email.com" value="${escapeHtml(c.email || "")}" />
      </div>
      <div class="email-field">
        <label>Subject</label>
        <input type="text" id="email-subject" value="${escapeHtml(c.email_draft.subject)}" />
      </div>
      <div class="email-field">
        <label>Body</label>
        <textarea id="email-body">${escapeHtml(c.email_draft.body)}</textarea>
      </div>
      <div class="send-row">
        <button class="send-btn btn-primary">${c.email_sent ? "Re-send" : "Send email"}</button>
        ${c.email_sent ? `<span class="sent-note">Sent ${new Date(c.email_sent_at).toLocaleString()}</span>` : ""}
      </div>
      <p class="error hidden" id="send-error"></p>
    </div>
  `;
}

function briefBlock(title, items) {
  if (!items || items.length === 0) return "";
  return `
    <div class="brief-block">
      <p class="brief-title">${title}</p>
      <ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </div>
  `;
}

async function sendEmail(candidateId) {
  const btn = detailPanel.querySelector(".send-btn");
  const errEl = detailPanel.querySelector("#send-error");
  const to = detailPanel.querySelector("#email-to").value;
  const subject = detailPanel.querySelector("#email-subject").value;
  const body = detailPanel.querySelector("#email-body").value;

  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId, to, subject, body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed.");

    candidates = candidates.map((c) => (c.id === data.candidate.id ? data.candidate : c));
    renderTable();
    openDetail(data.candidate.id);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Send email";
  }
}

loadCandidates();
