const META = JSON.parse(document.getElementById("rubric-meta").textContent);

const DECISION_BADGE_CLASS = {
  do_not_proceed: "badge-red",
  proceed_if_ambiguity_strong: "badge-amber",
  strong_proceed: "badge-green",
  fast_track: "badge-blue",
};

const uploadForm = document.getElementById("upload-form");
const uploadBtn = document.getElementById("upload-btn");
const uploadError = document.getElementById("upload-error");
const resumeInput = document.getElementById("resume-input");
const roleSelect = document.getElementById("role-select");

const candidatesBody = document.getElementById("candidates-body");
const candidatesTable = document.getElementById("candidates-table");
const emptyState = document.getElementById("empty-state");
const candidateCount = document.getElementById("candidate-count");

const overlay = document.getElementById("overlay");
const detailPanel = document.getElementById("detail-panel");

let candidates = [];

async function loadCandidates() {
  const res = await fetch("/api/candidates");
  const data = await res.json();
  candidates = data.candidates || [];
  renderTable();
}

function renderTable() {
  candidateCount.textContent = `${candidates.length} scored`;
  if (candidates.length === 0) {
    emptyState.classList.remove("hidden");
    candidatesTable.classList.add("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  candidatesTable.classList.remove("hidden");

  candidatesBody.innerHTML = "";
  candidates.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="rank">#${i + 1}</span>${escapeHtml(c.name)}</td>
      <td>${c.role}</td>
      <td style="font-family: ui-monospace, monospace">${c.composite_score.toFixed(2)}</td>
      <td>${gateBadge(c.gate.status)}</td>
      <td><span class="badge ${DECISION_BADGE_CLASS[c.decision]}">${META.decision_labels[c.decision]}</span></td>
      <td class="muted">${c.email_sent ? "Sent" : "Draft"}</td>
    `;
    tr.addEventListener("click", () => openDetail(c.id));
    candidatesBody.appendChild(tr);
  });
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

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = resumeInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  uploadBtn.textContent = "Scoring…";
  uploadError.classList.add("hidden");

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("role", roleSelect.value);
    const res = await fetch("/api/evaluate", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Evaluation failed.");

    candidates.push(data.candidate);
    candidates.sort((a, b) => b.composite_score - a.composite_score);
    renderTable();
    openDetail(data.candidate.id);

    uploadForm.reset();
  } catch (err) {
    uploadError.textContent = err.message;
    uploadError.classList.remove("hidden");
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = "Score candidate";
  }
});

function openDetail(id) {
  const c = candidates.find((x) => x.id === id);
  if (!c) return;
  detailPanel.innerHTML = renderDetail(c);
  overlay.classList.remove("hidden");

  detailPanel.querySelector(".close-btn").addEventListener("click", closeDetail);
  detailPanel.querySelector(".send-btn").addEventListener("click", () => sendEmail(c.id));
}

function closeDetail() {
  overlay.classList.add("hidden");
  detailPanel.innerHTML = "";
}

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeDetail();
});

function renderDetail(c) {
  const weights = META.weights[c.role];
  const pillarRows = META.pillar_ids
    .map((p) => {
      const s = c.pillar_scores[p];
      return `
        <div class="pillar-box">
          <div class="pillar-row">
            <span>${META.pillar_names[p]}</span>
            <span class="pillar-score">${s.score}/4 · ${Math.round(weights[p] * 100)}%</span>
          </div>
          <p>${escapeHtml(s.rationale)}</p>
        </div>
      `;
    })
    .join("");

  const brief = c.interview_brief;

  return `
    <div class="detail-header">
      <div>
        <h3>${escapeHtml(c.name)}</h3>
        <p>${c.role === "PM" ? "Product Manager" : "Senior Product Manager"} · ${escapeHtml(c.file_name)}</p>
      </div>
      <button class="close-btn">✕</button>
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <p class="label">Composite score</p>
        <p class="value">${c.composite_score.toFixed(2)}</p>
      </div>
      <div class="stat-box">
        <p class="label">Decision</p>
        <p class="value small">${META.decision_labels[c.decision]}</p>
      </div>
    </div>

    <div class="gate-box">
      <p class="label">Pillar 6 gate — structured-environment risk</p>
      <p class="gate-status" style="color: ${c.gate.status === "flag" ? "var(--amber)" : "var(--green)"}">
        ${c.gate.status === "flag" ? "Flag — probe in interview" : "Clear"}
      </p>
      <p class="muted">${escapeHtml(c.gate.rationale)}</p>
    </div>

    <p class="section-title">Pillar scores</p>
    ${pillarRows}

    <p class="section-title">Interview brief</p>
    <p style="font-size: 0.88rem; color: var(--text)">${escapeHtml(brief.summary)}</p>
    ${briefBlock("Strengths", brief.strengths)}
    ${briefBlock("Risks to probe", brief.risks_to_probe)}
    ${briefBlock("Suggested questions", brief.suggested_questions)}

    <p class="section-title">Draft outreach email</p>
    <div class="email-form">
      <input type="email" id="email-to" placeholder="candidate@email.com" value="${escapeHtml(c.email || "")}" />
      <input type="text" id="email-subject" value="${escapeHtml(c.email_draft.subject)}" />
      <textarea id="email-body">${escapeHtml(c.email_draft.body)}</textarea>
      <div class="send-row">
        <button class="send-btn secondary">${c.email_sent ? "Re-send" : "Send email"}</button>
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
