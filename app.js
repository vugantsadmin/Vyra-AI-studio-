const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  mode: "text-to-video",
  imageFile: null,
  currentJob: null,
  pollTimer: null
};

const config = window.VYRA_ENGINE_CONFIG || { demoMode: true };

function setStatus(message, kind = "neutral") {
  const status = $("#engineStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function setProgress(percent, label) {
  const bar = $("#progressBar");
  const labelNode = $("#progressLabel");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (labelNode) labelNode.textContent = label;
}

function setMode(mode) {
  state.mode = mode;
  $$(".mode-tab").forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("#imageInputPanel")?.classList.toggle("hidden", mode !== "image-to-video");
  $("#promptLabel").textContent = mode === "image-to-video" ? "Prompt (describe the motion)" : "Describe your video";
  $("#generateButton").textContent = mode === "image-to-video" ? "Animate image" : "Generate video";
  $("#previewTitle").textContent = mode === "image-to-video" ? "Image-to-Video Preview" : "Text-to-Video Preview";
}

$$(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));

$("#samplePrompt")?.addEventListener("click", () => {
  $("#promptInput").value = "A cinematic tracking shot of a futuristic motorcycle moving through a rainy neon-lit city at night, reflections on the street, dramatic lighting, smooth camera motion.";
});

$("#imageInput")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  state.imageFile = file || null;
  const preview = $("#uploadedImage");
  const placeholder = $("#uploadPlaceholder");
  if (!file) {
    preview?.removeAttribute("src");
    preview?.classList.add("hidden");
    placeholder?.classList.remove("hidden");
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("Please choose an image file.", "error");
    event.target.value = "";
    state.imageFile = null;
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    setStatus("Image is too large. Choose an image under 12 MB.", "error");
    event.target.value = "";
    state.imageFile = null;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.classList.remove("hidden");
  placeholder?.classList.add("hidden");
  setStatus("Image loaded locally. It has not been uploaded.", "success");
});

function readSettings() {
  return {
    prompt: $("#promptInput").value.trim(),
    mode: state.mode,
    aspectRatio: $("#aspectRatio").value,
    duration: Number($("#duration").value),
    quality: $("#quality").value,
    style: $("#style").value
  };
}

function showDemoResult(settings) {
  const preview = $("#videoPreview");
  const empty = $("#previewEmpty");
  const video = $("#resultVideo");
  video?.classList.add("hidden");
  preview?.classList.add("hidden");
  empty?.classList.remove("hidden");
  $("#resultNotice").textContent =
    "Demo only: your settings were validated, but no video was generated. Connect a real open-source model backend to render video.";
  $("#jobSummary").textContent = `${settings.mode === "image-to-video" ? "Image-to-Video" : "Text-to-Video"} · ${settings.aspectRatio} · ${settings.duration}s · ${settings.quality}`;
  setProgress(100, "Demo complete — no video rendered");
  setStatus("Demo mode is on. No data was sent anywhere.", "neutral");
}

function findMediaUrl(value, baseUrl) {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/")) return new URL(value, baseUrl).href;
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findMediaUrl(item, baseUrl);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    if (typeof value.url === "string") {
      const found = findMediaUrl(value.url, baseUrl);
      if (found) return found;
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === "url") continue;
      const found = findMediaUrl(item, baseUrl);
      if (found) return found;
    }
  }
  return null;
}

async function submitGenerationViaGradio(settings) {
  const base = config.gradioSpaceUrl.replace(/\/$/, "");
  let imageData = null;

  if (settings.mode === "image-to-video") {
    const uploadForm = new FormData();
    uploadForm.append("files", state.imageFile, state.imageFile.name);
    const uploadResponse = await fetch(`${base}/gradio_api/upload`, {
      method: "POST",
      body: uploadForm
    });
    if (!uploadResponse.ok) throw new Error(`Image upload failed (HTTP ${uploadResponse.status}).`);
    const uploaded = await uploadResponse.json();
    const first = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    imageData = typeof first === "string" ? { path: first, meta: { _type: "gradio.FileData" } } : first;
    if (!imageData || !imageData.path) throw new Error("The video engine did not accept the uploaded image.");
  }

  const modeLabel = settings.mode === "image-to-video" ? "Image-to-Video" : "Text-to-Video";
  const styleLabels = {
    cinematic: "Cinematic",
    realistic: "Photorealistic",
    anime: "Anime",
    "3d": "3D Animation",
    dreamlike: "Dreamlike"
  };
  const response = await fetch(`${base}/gradio_api/call/generate_video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [settings.prompt, modeLabel, imageData, Math.min(6, Math.max(3, settings.duration)), styleLabels[settings.style] || "Cinematic"]
    })
  });
  if (!response.ok) throw new Error(`Video engine request failed (HTTP ${response.status}).`);
  const accepted = await response.json();
  if (!accepted.event_id) throw new Error("The video engine did not return a job ID.");

  setProgress(10, "Waiting for free GPU…");
  setStatus("Connected to the free model Space. Waiting for GPU quota/queue…", "neutral");
  const resultResponse = await fetch(`${base}/gradio_api/call/generate_video/${encodeURIComponent(accepted.event_id)}`);
  if (!resultResponse.ok) throw new Error(`Generation status check failed (HTTP ${resultResponse.status}).`);
  const eventText = await resultResponse.text();
  const lines = eventText.split(/\r?\n/);
  let resultData = null;
  let eventName = "";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("event:")) eventName = lines[i].slice(6).trim();
    if (lines[i].startsWith("data:")) {
      const raw = lines[i].slice(5).trim();
      if (eventName === "complete") {
        try { resultData = JSON.parse(raw); } catch { resultData = null; }
      }
      if (eventName === "error") throw new Error(raw || "The model failed.");
    }
  }
  if (!resultData) throw new Error("The engine returned no completed result. Check the Space status and logs.");
  const videoUrl = findMediaUrl(resultData, base);
  if (!videoUrl) throw new Error("Generation returned, but no playable video URL was found.");
  $("#previewEmpty")?.classList.add("hidden");
  $("#resultVideo").src = videoUrl;
  $("#resultVideo")?.classList.remove("hidden");
  $("#resultNotice").textContent = "Video generated by the configured open-source model Space.";
  $("#downloadLink").href = videoUrl;
  $("#downloadLink").classList.remove("hidden");
  $("#jobSummary").textContent = `${modeLabel} · ${settings.aspectRatio} · up to ${Math.min(6, settings.duration)}s · ${settings.quality}`;
  setProgress(100, "Complete");
  setStatus("Video generated successfully.", "success");
}

async function submitGeneration(settings) {
  const form = new FormData();
  Object.entries(settings).forEach(([key, value]) => form.append(key, String(value)));
  if (state.imageFile && settings.mode === "image-to-video") form.append("image", state.imageFile);

  const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    body: form
  });
  if (!response.ok) throw new Error(`Backend returned HTTP ${response.status}`);
  const data = await response.json();
  if (!data.jobId) throw new Error("Backend response did not include a jobId.");
  state.currentJob = data.jobId;
  await pollJob(data.jobId);
}

async function pollJob(jobId) {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  for (let attempt = 0; attempt < (config.maxPollAttempts || 240); attempt++) {
    const response = await fetch(`${base}/api/jobs/${encodeURIComponent(jobId)}`);
    if (!response.ok) throw new Error(`Status check failed (HTTP ${response.status}).`);
    const job = await response.json();
    if (job.status === "queued") {
      setProgress(8, "Waiting in the model queue…");
    } else if (job.status === "running") {
      const percent = Number.isFinite(job.progress) ? job.progress : Math.min(92, 12 + attempt);
      setProgress(percent, "Generating video…");
    } else if (job.status === "succeeded" && job.videoUrl) {
      $("#previewEmpty")?.classList.add("hidden");
      $("#resultVideo").src = job.videoUrl;
      $("#resultVideo")?.classList.remove("hidden");
      $("#resultNotice").textContent = "Video generated by the connected backend.";
      $("#downloadLink").href = job.videoUrl;
      $("#downloadLink").classList.remove("hidden");
      setProgress(100, "Complete");
      setStatus("Video generated successfully.", "success");
      return;
    } else if (job.status === "failed") {
      throw new Error(job.error || "The model failed to generate this video.");
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs || 2500));
  }
  throw new Error("Timed out while waiting for the job. Check the backend job status.");
}

$("#generateButton")?.addEventListener("click", async () => {
  const settings = readSettings();
  if (!settings.prompt) {
    setStatus("Write a prompt first.", "error");
    $("#promptInput").focus();
    return;
  }
  if (settings.mode === "image-to-video" && !state.imageFile) {
    setStatus("Upload an image for Image-to-Video.", "error");
    return;
  }
  $("#generateButton").disabled = true;
  $("#generateButton").textContent = "Preparing…";
  setProgress(2, "Preparing request…");
  $("#resultNotice").textContent = "";
  try {
    if (config.gradioSpaceUrl) {
      setStatus("Connecting to the free model Space…", "neutral");
      await submitGenerationViaGradio(settings);
    } else if (config.demoMode || !config.apiBaseUrl) {
      showDemoResult(settings);
    } else {
      setStatus("Sending request to your configured backend…", "neutral");
      await submitGeneration(settings);
    }
  } catch (error) {
    setStatus(error.message || "Something went wrong.", "error");
    setProgress(0, "Generation failed");
  } finally {
    $("#generateButton").disabled = false;
    $("#generateButton").textContent = state.mode === "image-to-video" ? "Animate image" : "Generate video";
  }
});

$("#duration")?.addEventListener("input", (event) => {
  $("#durationValue").textContent = `${event.target.value}s`;
});

setMode("text-to-video");
setStatus(config.demoMode ? "Demo mode · engine not connected" : "Engine configured · ready to test", "neutral");
