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
