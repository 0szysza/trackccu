(() => {
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-copy-discord]");
    if (!button) return;
    let feedback = button.parentElement.querySelector(".copy-feedback");
    if (!feedback) { feedback = document.createElement("span"); feedback.className = "copy-feedback"; feedback.setAttribute("role", "status"); button.after(feedback); }
    try { await navigator.clipboard.writeText("0szysza"); feedback.textContent = "Copied"; }
    catch { feedback.textContent = "Discord: 0szysza"; }
    setTimeout(() => feedback.remove(), 2500);
  });
})();
