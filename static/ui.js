// Shared confirm modal / toast helpers, used on both the main dashboard
// and individual candidate pages. Requires the #confirm-overlay / #toast
// markup from templates/_modal.html to be present on the page.

const confirmOverlay = document.getElementById("confirm-overlay");
const confirmTitle = document.getElementById("confirm-title");
const confirmBody = document.getElementById("confirm-body");
const confirmCancel = document.getElementById("confirm-cancel");
const confirmOk = document.getElementById("confirm-ok");
const toast = document.getElementById("toast");

let toastTimer = null;

function confirmDialog(title, body) {
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOverlay.classList.remove("hidden");

  return new Promise((resolve) => {
    function cleanup(result) {
      confirmOverlay.classList.add("hidden");
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      confirmOverlay.removeEventListener("click", onOverlay);
      resolve(result);
    }
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    function onOverlay(e) {
      if (e.target === confirmOverlay) cleanup(false);
    }
    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
    confirmOverlay.addEventListener("click", onOverlay);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !confirmOverlay.classList.contains("hidden")) {
    confirmCancel.click();
  }
});

// --- Dual-role grading (mirrors rubric.py's compute_composite/decide_band) ---
//
// The rubric's pillar rating anchors (1-4) are identical for PM and Senior
// PM - only the weighting differs. So a candidate's pillar_scores can be
// re-graded for either role purely with arithmetic, no re-scoring needed.

function computeCompositeFor(pillarScores, weights) {
  let total = 0;
  for (const p of Object.keys(weights)) {
    total += pillarScores[p].score * weights[p];
  }
  return Math.round(total * 100) / 100;
}

function decideBandFor(composite, p3Score, gateStatus) {
  let decision;
  if (composite < 2.2) decision = "do_not_proceed";
  else if (composite <= 2.7) decision = p3Score >= 3 ? "proceed_if_ambiguity_strong" : "do_not_proceed";
  else if (composite <= 3.3) decision = "strong_proceed";
  else decision = "fast_track";

  if (gateStatus === "flag" && decision === "fast_track") decision = "strong_proceed";
  return decision;
}

function gradeFor(candidate, role, weightsByRole) {
  const composite = computeCompositeFor(candidate.pillar_scores, weightsByRole[role]);
  const decision = decideBandFor(composite, candidate.pillar_scores.p3.score, candidate.gate.status);
  return { composite, decision };
}

// --- Theme toggle (dark default; persisted in localStorage) ---

const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("kargo-theme", next);
    } catch (e) {
      // localStorage unavailable (private mode etc.) - theme just won't persist.
    }
  });
}
