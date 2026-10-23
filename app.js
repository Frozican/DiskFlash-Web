const $ = (id) => document.getElementById(id);
const HELPER = "http://127.0.0.1:8765";
let progressPoll = null;
let selectedFile = null, sha256 = "", drives = [], connected = false, flashing = false;
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown size";
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
function currentDrive() { return drives.find(d => d.id === $("target").value) || null; }
function updateSummary() {
  const d = currentDrive();
  $("summaryImage").textContent = selectedFile ? selectedFile.name : "No image selected";
  $("summarySize").textContent = selectedFile ? formatBytes(selectedFile.size) : "—";
  $("summaryTarget").textContent = d ? `${d.name} · ${d.id}` : "No disk selected";
  $("summaryCapacity").textContent = d ? formatBytes(d.size) : "—";
  $("summaryBlock").textContent = formatBytes(Number($("blockSize").value));
  const invalidDrive = !d || d.system || d.readonly || (d.mounted && d.mounted.length) || (selectedFile && selectedFile.size > d.size);
  $("flashBtn").disabled = !(connected && selectedFile && d && $("confirm").checked && !invalidDrive && !flashing);
  if (!selectedFile) $("buttonHelp").textContent = "Choose a disk image first.";
  else if (!connected) $("buttonHelp").textContent = "Connect the local helper before writing.";
  else if (!d) $("buttonHelp").textContent = "Select a target physical disk.";
  else if (d.system) $("buttonHelp").textContent = "Blocked: this is marked as a boot/system disk.";
  else if (d.readonly) $("buttonHelp").textContent = "Blocked: this disk is read-only.";
  else if (d.mounted && d.mounted.length) $("buttonHelp").textContent = "Blocked: unmount/eject all partitions on this disk first.";
  else if (selectedFile.size > d.size) $("buttonHelp").textContent = "Blocked: the image is larger than this disk.";
  else if (!$("confirm").checked) $("buttonHelp").textContent = "Tick the data-loss confirmation to enable writing.";
  else $("buttonHelp").textContent = "Ready. You will also need to type the exact disk identifier before writing.";
  showDriveInfo();
}
function showDriveInfo() {
  const d = currentDrive(), box = $("diskInfo");
  if (!d) { box.classList.add("hidden"); box.textContent = ""; return; }
  const warnings = [];
  if (d.system) warnings.push("Marked as a boot/system disk — writing is blocked.");
  if (d.readonly) warnings.push("Disk is read-only — writing is blocked.");
  if (d.mounted && d.mounted.length) warnings.push("Mounted partitions: " + d.mounted.join(", ") + ". Unmount/eject these before flashing.");
  if (selectedFile && selectedFile.size > d.size) warnings.push("Image is larger than the target disk.");
  box.textContent = `${d.name} · ${d.bus || "unknown bus"} · ${d.serial ? "Serial: " + d.serial : "No serial reported"}${warnings.length ? " — " + warnings.join(" ") : " — target is eligible for writing"}`;
  box.classList.toggle("hidden", false);
  box.classList.toggle("danger", warnings.length > 0);
}
function setFile(file) {
  if (!file) return;
  selectedFile = file; sha256 = "";
  $("filePrompt").textContent = "Image selected";
  $("fileName").textContent = file.name;
  $("fileMeta").textContent = `${formatBytes(file.size)} · ${file.type || "Unknown file type"}`;
  $("fileInfo").classList.remove("hidden"); $("hashResult").classList.add("hidden");
  $("hashStatus").textContent = "Optional; very large files may take a while.";
  $("result").classList.add("hidden"); updateSummary();
}
$("imageFile").addEventListener("change", e => setFile(e.target.files[0]));
$("removeFile").addEventListener("click", () => {
  selectedFile = null; sha256 = ""; $("imageFile").value = "";
  $("fileInfo").classList.add("hidden"); $("filePrompt").textContent = "Drop your image here";
  $("result").classList.add("hidden"); updateSummary();
});
["blockSize", "target"].forEach(id => $(id).addEventListener("change", () => { $("result").classList.add("hidden"); updateSummary(); }));
$("confirm").addEventListener("change", updateSummary);
const dropzone = $("dropzone");
["dragenter", "dragover"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
["dragleave", "drop"].forEach(type => dropzone.addEventListener(type, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
dropzone.addEventListener("drop", e => setFile(e.dataTransfer.files[0]));

async function connectHelper() {
  $("connectBtn").disabled = true; $("helperStatus").textContent = "Connecting…";
  try {
    const res = await fetch(HELPER + "/api/drives", {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Helper returned an error");
    drives = data.drives || []; connected = true;
    const old = $("target").value;
    $("target").replaceChildren(new Option("Select a physical disk…", ""));
    for (const d of drives) {
      const label = `${d.name} — ${formatBytes(d.size)} — ${d.id}${d.system ? " [SYSTEM]" : ""}`;
      $("target").add(new Option(label, d.id));
    }
    if (drives.some(d => d.id === old)) $("target").value = old;
    $("helperDot").classList.add("online");
    $("helperStatus").textContent = "Local helper connected";
    $("helperDetail").textContent = `${drives.length} physical disk(s) found · ${data.platform || "local computer"}`;
    $("targetHelp").textContent = "Disk list supplied by the local helper. System disks are blocked where the OS identifies them.";
    updateSummary();
  } catch (e) {
    connected = false; drives = [];
    $("helperDot").classList.remove("online");
    $("helperStatus").textContent = "Helper not connected";
    $("helperDetail").textContent = `${e.message}. Start flash_helper.py on your computer and retry.`;
    $("target").replaceChildren(new Option("Helper unavailable — connect first", ""));
    updateSummary();
  } finally { $("connectBtn").disabled = false; }
}
$("connectBtn").addEventListener("click", connectHelper);
$("hashBtn").addEventListener("click", async () => {
  if (!selectedFile) { $("hashStatus").textContent = "Choose an image first."; return; }
  if (!crypto.subtle) { $("hashStatus").textContent = "SHA-256 requires HTTPS or localhost."; return; }
  $("hashBtn").disabled = true; $("hashBtn").textContent = "Calculating…";
  $("hashStatus").textContent = "Reading the file in memory; very large images may exceed available memory.";
  try {
    const buffer = await selectedFile.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    $("hashValue").textContent = sha256; $("hashResult").classList.remove("hidden");
    $("hashStatus").textContent = "Checksum calculated in this browser.";
  } catch { $("hashStatus").textContent = "Could not calculate checksum; the file may be too large for available memory."; }
  finally { $("hashBtn").disabled = false; $("hashBtn").textContent = "Calculate SHA-256"; }
});
$("copyHash").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(sha256); $("copyHash").textContent = "Copied"; }
  catch { $("copyHash").textContent = "Copy unavailable"; }
});
function showResult(message, ok) {
  const el = $("result"); el.textContent = message;
  el.className = "result " + (ok ? "success" : "danger");
}
$("flashBtn").addEventListener("click", async () => {
  const d = currentDrive();
  if (!connected || !selectedFile || !d || !$("confirm").checked || flashing) return;
  const typed = window.prompt(
    `FINAL WARNING: This will overwrite ${d.id} (${d.name}, ${formatBytes(d.size)}).\n\nAll data on this disk may be destroyed.\n\nType the exact disk identifier below to continue:`,
    ""
  );
  if (typed !== d.id) { showResult("Cancelled. The disk identifier did not match exactly.", false); return; }
  if (!window.confirm(`Last check: write "${selectedFile.name}" to ${d.id}? This is irreversible.`)) return;
  flashing = true; $("flashBtn").disabled = true; $("progressWrap").classList.remove("hidden");
  $("progressBar").style.width = "0%"; $("progressStatus").textContent = "Uploading image and writing disk…";
  $("progressPercent").textContent = "0%"; $("result").classList.add("hidden");
  const url = HELPER + "/api/flash?device=" + encodeURIComponent(d.id);
  try {
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Target-Confirm", d.id);
      xhr.setRequestHeader("X-Image-Size", String(selectedFile.size));
      xhr.setRequestHeader("X-Block-Size", $("blockSize").value);
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const p = Math.min(49, Math.floor(e.loaded / e.total * 49));
          $("progressBar").style.width = p + "%"; $("progressPercent").textContent = p + "%";
          $("progressStatus").textContent = "Sending image to helper: " + formatBytes(e.loaded) + " / " + formatBytes(e.total);
        }
      };
      progressPoll = setInterval(async () => {
        try {
          const r = await fetch(HELPER + "/api/progress", {cache:"no-store"});
          if (!r.ok) return;
          const p = await r.json();
          if (p.stage === "writing" && p.total) {
            const percent = Math.min(49, Math.floor(p.written / p.total * 49));
            $("progressBar").style.width = percent + "%"; $("progressPercent").textContent = percent + "%";
            $("progressStatus").textContent = "Writing: " + formatBytes(p.written) + " / " + formatBytes(p.total) + " · " + formatBytes(p.speed) + "/s · " + (p.eta == null ? "calculating ETA" : Math.ceil(p.eta) + "s left");
          } else if (p.stage === "verifying" && p.total) {
            const percent = 50 + Math.floor(p.verified / p.total * 49);
            $("progressBar").style.width = percent + "%"; $("progressPercent").textContent = percent + "%";
            $("progressStatus").textContent = "Verifying written data: " + formatBytes(p.verified) + " / " + formatBytes(p.total);
          }
        } catch (err) {}
      }, 500);
      xhr.onload = () => {
        let body; try { body = JSON.parse(xhr.responseText); } catch { body = {error:xhr.responseText || "Invalid helper response"}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body); else reject(new Error(body.error || "Write failed"));
      };
      xhr.onerror = () => reject(new Error("Could not reach the local helper. The write may have been interrupted."));
      xhr.onabort = () => reject(new Error("Upload aborted. The disk may contain a partial image."));
      xhr.send(selectedFile);
    });
    $("progressBar").style.width = "100%"; $("progressPercent").textContent = "100%";
    $("progressStatus").textContent = "Write completed";
    const speed = response.average_bytes_per_second ? " Average throughput: " + formatBytes(response.average_bytes_per_second) + "/s." : "";
    showResult("SUCCESS: wrote " + formatBytes(response.written) + " to " + d.id + " and verified it with read-back SHA-256." + speed + " Safely eject the disk before unplugging it.", true);
    $("confirm").checked = false;
  } catch (e) {
    $("progressStatus").textContent = "Write failed or interrupted";
    showResult(`ERROR: ${e.message} If writing had started, the target may contain a partial image. Do not assume it is usable.`, false);
  } finally {
    if (progressPoll) { clearInterval(progressPoll); progressPoll = null; }
    flashing = false; updateSummary();
  }
});
updateSummary();