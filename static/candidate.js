const sendBtn = document.getElementById("send-email-btn");
const sendError = document.getElementById("send-error");
const sentNote = document.getElementById("sent-note");

// Pillar bars render at width:0 (data-width holds the real value) so this
// transition actually plays instead of snapping straight to final state.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.querySelectorAll(".js-animate-bar[data-width]").forEach((el) => {
      el.style.width = el.dataset.width;
    });
  });
});

// --- Grading role toggle: re-derive composite/decision/weights from the ---
// --- same pillar scores, no re-scoring needed. ---

const viewRoleSegmented = document.getElementById("view-role-segmented");
if (viewRoleSegmented) {
  viewRoleSegmented.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-option");
    if (!btn) return;
    viewRoleSegmented.querySelectorAll(".segmented-option").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyGrading(btn.dataset.role);
  });
}

function applyGrading(role) {
  const g = gradeFor(
    { pillar_scores: window.CANDIDATE_PILLAR_SCORES, gate: { status: window.CANDIDATE_GATE_STATUS } },
    role,
    window.WEIGHTS
  );
  document.getElementById("composite-value").textContent = g.composite.toFixed(2);
  document.getElementById("decision-value").textContent = window.DECISION_LABELS[g.decision];

  const weights = window.WEIGHTS[role];
  document.querySelectorAll("[data-pillar-weight-for]").forEach((el) => {
    const p = el.dataset.pillarWeightFor;
    const score = window.CANDIDATE_PILLAR_SCORES[p].score;
    el.textContent = `${score}/4 · ${Math.round(weights[p] * 100)}%`;
  });
}

sendBtn.addEventListener("click", async () => {
  const to = document.getElementById("email-to").value;
  const subject = document.getElementById("email-subject").value;
  const body = document.getElementById("email-body").value;

  sendError.classList.add("hidden");
  sendBtn.disabled = true;
  const originalLabel = sendBtn.textContent;
  sendBtn.textContent = "Sending…";

  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: window.CANDIDATE_ID, to, subject, body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Send failed.");

    sendBtn.textContent = "Re-send";
    sentNote.textContent = `Sent ${new Date(data.candidate.email_sent_at).toLocaleString()}`;
    sentNote.classList.remove("hidden");
    showToast("Email sent.");
  } catch (err) {
    sendError.textContent = err.message;
    sendError.classList.remove("hidden");
    sendBtn.textContent = originalLabel;
  } finally {
    sendBtn.disabled = false;
  }
});

document.getElementById("delete-candidate-btn").addEventListener("click", async () => {
  const ok = await confirmDialog(
    "Delete candidate?",
    "This permanently deletes this candidate from the ranked dashboard. This can't be undone."
  );
  if (!ok) return;

  try {
    const res = await fetch(`/api/candidates/${window.CANDIDATE_ID}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Delete failed.");
    window.location.href = "/";
  } catch (err) {
    showToast(err.message);
  }
});
