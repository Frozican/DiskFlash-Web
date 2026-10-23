const $ = (id) => document.getElementById(id);
let selectedFile = null;
let sha256 = "";
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
function updateSummary() {
  $("summaryImage").textContent = selectedFile ? selectedFile.name : "No image selected";
  $("summarySize").textContent = selectedFile ? formatBytes(selectedFile.size) : "—";
  $("summaryBlock").textContent = $("blockSize").value;
  $("summaryFlag").textContent = $("oflag").value;
  $("planBtn").disabled = !(selectedFile && $("confirm").checked);
  $("buttonHelp").textContent = !selectedFile ? "Choose an image and acknowledge the data-loss warning to continue." : !$("confirm").checked ? "Confirm that flashing can erase data to prepare a plan." : "Ready to prepare a plan. This will not write to a drive.";
}
function setFile(file) {
  if (!file) return;
  selectedFile = file; sha256 = "";
  $("filePrompt").textContent = "Image selected";
  $("fileName").textContent = file.name;
  $("fileMeta").textContent = `${formatBytes(file.size)} · ${file.type || "Unknown file type"}`;
  $("fileInfo").classList.remove("hidden"); $("hashResult").classList.add("hidden");
  $("hashStatus").textContent = "Optional; large files may take a while.";
  $("plan").classList.add("hidden"); updateSummary();
}
$("imageFile").addEventListener("change", e => setFile(e.target.files[0]));
$("removeFile").addEventListener("click", () => {
  selectedFile = null; sha256 = ""; $("imageFile").value = "";
  $("fileInfo").classList.add("hidden"); $("filePrompt").textContent = "Drop your image here";
  $("plan").classList.add("hidden"); updateSummary();
});
["blockSize", "oflag"].forEach(id => $(id).addEventListener("change", () => { updateSummary(); $("plan").classList.add("hidden"); }));
$("confirm").addEventListener("change", updateSummary);
const dropzone = $("dropzone");
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
dropzone.addEventListener("drop", e => setFile(e.dataTransfer.files[0]));
$("hashBtn").addEventListener("click", async () => {
  if (!selectedFile) { $("hashStatus").textContent = "Choose an image first."; return; }
  if (!crypto.subtle) { $("hashStatus").textContent = "SHA-256 requires a secure context (HTTPS or localhost)."; return; }
  $("hashBtn").disabled = true; $("hashBtn").textContent = "Calculating…";
  $("hashStatus").textContent = "Reading file into memory; very large images may exceed browser memory.";
  try {
    const buffer = await selectedFile.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    $("hashValue").textContent = sha256; $("hashResult").classList.remove("hidden");
    $("hashStatus").textContent = "Checksum calculated in this browser.";
  } catch (err) { $("hashStatus").textContent = "Could not calculate checksum. The file may be too large for available memory."; }
  finally { $("hashBtn").disabled = false; $("hashBtn").textContent = "Calculate SHA-256"; }
});
$("copyHash").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(sha256); $("copyHash").textContent = "Copied"; }
  catch { $("copyHash").textContent = "Copy unavailable"; }
});
$("planBtn").addEventListener("click", () => {
  if (!selectedFile || !$("confirm").checked) return;
  const lines = [
    "CFLASH WEB — FLASH PLAN", "=======================",
    `Image: ${selectedFile.name}`,
    `Image size: ${selectedFile.size} bytes (${formatBytes(selectedFile.size)})`,
    `Block size: ${$("blockSize").value}`, `oflag: ${$("oflag").value}`,
    sha256 ? `SHA-256: ${sha256}` : "SHA-256: not calculated", "",
    "STATUS: PLAN ONLY — NO DEVICE WAS WRITTEN", "",
    "This browser page cannot safely select or overwrite a standard USB mass-storage drive.",
    "Use a trusted local flashing tool on your operating system.",
    "If using a command-line tool, verify the exact input path and target device before running it.",
    "A wrong target device can permanently destroy data."
  ];
  $("planText").value = lines.join("\n"); $("plan").classList.remove("hidden");
  $("plan").scrollIntoView({ behavior: "smooth", block: "nearest" });
});
$("copyPlan").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("planText").value); $("copyPlan").textContent = "Copied"; }
  catch { $("copyPlan").textContent = "Copy unavailable"; }
});
$("downloadPlan").addEventListener("click", () => {
  const blob = new Blob([$("planText").value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "cflash-plan.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
updateSummary();