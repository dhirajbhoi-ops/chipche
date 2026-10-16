const form = document.querySelector("#clipForm");
const urlInput = document.querySelector("#url");
const durationInput = document.querySelector("#duration");
const startInput = document.querySelector("#start");
const endInput = document.querySelector("#end");
const startRange = document.querySelector("#startRange");
const endRange = document.querySelector("#endRange");
const fetchInfoButton = document.querySelector("#fetchInfo");
const logEl = document.querySelector("#log");
const statusEl = document.querySelector("#toolStatus");
const downloadLink = document.querySelector("#downloadLink");
const submitButton = form.querySelector(".primary");
const rangeFill = document.querySelector("#rangeFill");
const startHandle = document.querySelector("#startHandle");
const endHandle = document.querySelector("#endHandle");
const startBubble = document.querySelector("#startBubble");
const endBubble = document.querySelector("#endBubble");
const clipSummary = document.querySelector("#clipSummary");
const clipLength = document.querySelector("#clipLength");
const ringValue = document.querySelector("#ringValue");
const videoCard = document.querySelector("#videoCard");
const videoThumb = document.querySelector("#videoThumb");
const videoPreview = document.querySelector("#videoPreview");
const videoTitle = document.querySelector("#videoTitle");
const videoMeta = document.querySelector("#videoMeta");

let pollTimer = null;
let knownDuration = 0;

function parseTime(value) {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!/^\d{1,3}(:[0-5]\d){1,2}$/.test(clean)) return null;
  const parts = clean.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map(part => String(part).padStart(2, "0")).join(":");
}

function compactDuration(seconds) {
  const safe = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getYouTubeId(value) {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split("/")[0];
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2];
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2];
    }
  } catch {
    return "";
  }
  return "";
}

function setLog(lines) {
  logEl.textContent = Array.isArray(lines) && lines.length ? lines.join("\n") : "Working...";
  logEl.scrollTop = logEl.scrollHeight;
}

function setBusy(isBusy, label = "Downloading") {
  submitButton.disabled = isBusy;
  fetchInfoButton.disabled = isBusy;
  statusEl.textContent = isBusy ? label : "Ready";
  statusEl.classList.toggle("is-active", isBusy);
}

function setDuration(durationSeconds, source = "manual") {
  knownDuration = Math.max(0, Math.round(durationSeconds || 0));
  const hasDuration = knownDuration > 0;
  startRange.disabled = !hasDuration;
  endRange.disabled = !hasDuration;

  if (hasDuration) {
    durationInput.value = formatTime(knownDuration);
    startRange.max = String(knownDuration);
    endRange.max = String(knownDuration);
    videoMeta.dataset.durationSource = source;
  }
}

function resetTimeline() {
  rangeFill.style.left = "0%";
  rangeFill.style.width = "0%";
  startHandle.style.left = "0%";
  endHandle.style.left = "0%";
  startBubble.textContent = "--";
  endBubble.textContent = "--";
  clipSummary.textContent = "Waiting for duration";
  clipLength.textContent = "--";
  ringValue.textContent = "--";
  document.documentElement.style.setProperty("--ring", "0%");
}

function syncFromSeconds(startSeconds, endSeconds, updateInputs = true) {
  if (!knownDuration) {
    resetTimeline();
    return;
  }

  const start = clamp(startSeconds, 0, Math.max(0, knownDuration - 1));
  const end = clamp(Math.max(endSeconds, start + 1), 1, knownDuration);
  const startPct = (start / knownDuration) * 100;
  const endPct = (end / knownDuration) * 100;
  const width = Math.max(0.5, endPct - startPct);
  const selectedSeconds = end - start;
  const selectedPct = Math.max(1, Math.round((selectedSeconds / knownDuration) * 100));

  if (updateInputs) {
    startInput.value = formatTime(start);
    endInput.value = formatTime(end);
    startRange.value = String(start);
    endRange.value = String(end);
  }

  rangeFill.style.left = `${startPct}%`;
  rangeFill.style.width = `${width}%`;
  startHandle.style.left = `${startPct}%`;
  endHandle.style.left = `${endPct}%`;
  startBubble.textContent = formatTime(start);
  endBubble.textContent = formatTime(end);
  clipSummary.textContent = `${formatTime(start)} to ${formatTime(end)}`;
  clipLength.textContent = compactDuration(selectedSeconds);
  ringValue.textContent = `${selectedPct}%`;
  document.documentElement.style.setProperty("--ring", `${selectedPct}%`);
}

function syncFromInputs() {
  const duration = parseTime(durationInput.value);
  if (duration) setDuration(duration);

  const start = parseTime(startInput.value);
  const end = parseTime(endInput.value);
  if (start !== null && end !== null) syncFromSeconds(start, end);
}

function updatePreviewFromUrl() {
  const videoId = getYouTubeId(urlInput.value.trim());
  if (!videoId) {
    videoPreview.removeAttribute("src");
    videoCard.classList.add("is-empty");
    videoTitle.textContent = "Paste a YouTube URL to preview";
    videoMeta.textContent = "Click Get Video Details to read the real duration.";
    return;
  }

  videoCard.classList.remove("is-empty");
  videoPreview.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
  videoThumb.style.backgroundImage = "";
  videoTitle.textContent = "YouTube preview loaded";
  videoMeta.textContent = "Now click Get Video Details to get the exact length.";
}

async function fetchVideoDetails() {
  const url = urlInput.value.trim();
  downloadLink.classList.add("hidden");
  updatePreviewFromUrl();
  setBusy(true, "Reading");
  setLog(["Reading video details with yt-dlp..."]);

  try {
    const res = await fetch("/api/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    const info = await res.json();

    if (!res.ok) throw new Error(info.error || "Could not read video details.");

    videoCard.classList.remove("is-empty");
    videoTitle.textContent = info.title;
    videoMeta.textContent = [info.channel, info.durationText].filter(Boolean).join(" • ");
    if (!videoPreview.src && info.thumbnail) {
      videoThumb.style.backgroundImage = `url("${info.thumbnail}")`;
    }

    if (info.duration) {
      setDuration(info.duration, "fetched");
      const requestedEnd = parseTime(endInput.value) || Math.min(info.duration, 10 * 60);
      syncFromSeconds(parseTime(startInput.value) || 0, Math.min(info.duration, requestedEnd));
    }

    setLog(["Details loaded.", "Select the clip range, then start the MP4 download."]);
  } catch (err) {
    setLog(String(err.message || err).split("\n"));
    if (!knownDuration) {
      resetTimeline();
      setLog([
        ...String(err.message || err).split("\n"),
        "",
        "If the preview shows but details do not load, install yt-dlp and ffmpeg, then restart the app.",
        "You can also type the video length manually to use the range selector."
      ]);
    }
  } finally {
    setBusy(false);
  }
}

async function pollJob(id) {
  const res = await fetch(`/api/jobs/${id}`);
  const job = await res.json();

  if (!res.ok) throw new Error(job.error || "Could not load job.");

  setLog(job.log);

  if (job.status === "complete") {
    clearInterval(pollTimer);
    pollTimer = null;
    setBusy(false);
    statusEl.textContent = "Complete";
    downloadLink.href = job.downloadUrl;
    downloadLink.classList.remove("hidden");
    setLog([...job.log, "", "Done. Your MP4 clip is ready."]);
  }

  if (job.status === "failed") {
    clearInterval(pollTimer);
    pollTimer = null;
    setBusy(false);
    statusEl.textContent = "Failed";
    downloadLink.classList.add("hidden");
  }
}

urlInput.addEventListener("input", updatePreviewFromUrl);
fetchInfoButton.addEventListener("click", fetchVideoDetails);

[durationInput, startInput, endInput].forEach(input => {
  input.addEventListener("input", syncFromInputs);
  input.addEventListener("change", syncFromInputs);
  input.addEventListener("blur", syncFromInputs);
});

startRange.addEventListener("input", () => {
  syncFromSeconds(Number(startRange.value), Number(endRange.value));
});

endRange.addEventListener("input", () => {
  syncFromSeconds(Number(startRange.value), Number(endRange.value));
});

document.querySelectorAll("[data-jump]").forEach(button => {
  button.addEventListener("click", () => {
    const start = parseTime(startInput.value) || 0;
    const length = Number(button.dataset.jump);
    if (!knownDuration) {
      endInput.value = formatTime(start + length);
      clipSummary.textContent = `${formatTime(start)} to ${formatTime(start + length)}`;
      clipLength.textContent = compactDuration(length);
      setLog(["Enter or fetch the video length to activate the visual timeline."]);
      return;
    }
    syncFromSeconds(start, Math.min(knownDuration, start + length));
  });
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearInterval(pollTimer);
  syncFromInputs();
  downloadLink.classList.add("hidden");

  if (!urlInput.value.trim()) {
    setLog(["Paste a video URL first."]);
    return;
  }

  if (parseTime(startInput.value) === null || parseTime(endInput.value) === null) {
    setLog(["Enter a valid start and end time, like 00:10:00 to 01:20:00."]);
    return;
  }

  setBusy(true);
  setLog(["Starting MP4 clip download..."]);

  const data = new FormData(form);
  const payload = {
    url: data.get("url"),
    start: data.get("start"),
    end: data.get("end"),
    quality: data.get("quality")
  };

  try {
    const res = await fetch("/api/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || "Could not start the download.");

    setLog(["Job started.", "Multi-hour clips can take a while. Keep this tab open."]);
    pollTimer = setInterval(() => pollJob(result.id).catch(err => {
      clearInterval(pollTimer);
      pollTimer = null;
      setBusy(false);
      statusEl.textContent = "Error";
      setLog([err.message]);
    }), 1500);
    await pollJob(result.id);
  } catch (err) {
    setBusy(false);
    statusEl.textContent = "Error";
    setLog(String(err.message || err).split("\n"));
  }
});

resetTimeline();
