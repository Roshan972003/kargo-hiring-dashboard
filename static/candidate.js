const sendBtn = document.getElementById("send-email-btn");
const sendError = document.getElementById("send-error");
const sentNote = document.getElementById("sent-note");

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
