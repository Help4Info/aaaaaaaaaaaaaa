/* FlowWhisper — logique frontend
 * Capture micro (MediaRecorder) -> /api/transcribe -> /api/refine -> affichage.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    recordBtn: $("recordBtn"),
    status: $("statusDot"),
    statusText: $("statusText"),
    hint: $("hint"),
    timer: $("timer"),
    levels: $("levels"),
    language: $("language"),
    mode: $("mode"),
    autoRefine: $("autoRefine"),
    output: $("output"),
    meta: $("meta"),
    refineBtn: $("refineBtn"),
    copyBtn: $("copyBtn"),
    historyList: $("historyList"),
    clearHistory: $("clearHistory"),
    providerInfo: $("providerInfo"),
    toast: $("toast"),
  };

  const state = {
    recording: false,
    mediaRecorder: null,
    chunks: [],
    stream: null,
    audioCtx: null,
    analyser: null,
    rafId: null,
    startTime: 0,
    timerId: null,
    history: loadHistory(),
  };

  // --- Utilitaires ---------------------------------------------------------

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (els.toast.hidden = true), 2200);
  }

  function setStatus(kind, text) {
    els.status.className = "dot" + (kind ? " " + kind : "");
    els.statusText.textContent = text;
  }

  function fmtTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(Math.floor(sec % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  // --- Chargement de la configuration --------------------------------------

  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      els.language.innerHTML = cfg.languages
        .map((l) => `<option value="${l.code}"${l.code === "auto" ? " selected" : ""}>${l.label}</option>`)
        .join("");
      els.providerInfo.textContent = `Raffinage : ${cfg.refine_provider} · Modèle : ${cfg.whisper_model}`;
      setStatus("ok", "Prêt");
    } catch (e) {
      setStatus("err", "Serveur injoignable");
      toast("Impossible de contacter le serveur.");
    }
  }

  // --- Enregistrement ------------------------------------------------------

  async function startRecording() {
    if (state.recording) return;
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast("Accès au micro refusé.");
      return;
    }

    state.chunks = [];
    const mime = pickMime();
    state.mediaRecorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
    state.mediaRecorder.ondataavailable = (e) => e.data.size > 0 && state.chunks.push(e.data);
    state.mediaRecorder.onstop = onRecordingStop;
    state.mediaRecorder.start();

    state.recording = true;
    els.recordBtn.classList.add("recording");
    els.hint.textContent = "Enregistrement… relâchez pour transcrire";
    els.timer.hidden = false;
    state.startTime = Date.now();
    state.timerId = setInterval(() => {
      els.timer.textContent = fmtTime((Date.now() - state.startTime) / 1000);
    }, 250);

    startMeter();
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    els.recordBtn.classList.remove("recording");
    clearInterval(state.timerId);
    els.timer.hidden = true;
    stopMeter();
    try { state.mediaRecorder.stop(); } catch (_) {}
  }

  async function onRecordingStop() {
    (state.stream?.getTracks() || []).forEach((t) => t.stop());
    const blob = new Blob(state.chunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
    if (blob.size < 1200) {
      els.hint.textContent = "Enregistrement trop court.";
      return;
    }
    await transcribe(blob);
  }

  function pickMime() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return candidates.find((c) => window.MediaRecorder && MediaRecorder.isTypeSupported(c)) || "";
  }

  // --- Indicateur de niveau audio ------------------------------------------

  function startMeter() {
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = state.audioCtx.createMediaStreamSource(state.stream);
      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = 64;
      src.connect(state.analyser);
      const bars = els.levels.querySelectorAll("span");
      const data = new Uint8Array(state.analyser.frequencyBinCount);
      const draw = () => {
        state.analyser.getByteFrequencyData(data);
        bars.forEach((bar, i) => {
          const v = data[i * 2] / 255;
          bar.style.height = 6 + v * 20 + "px";
          bar.style.opacity = 0.35 + v * 0.65;
        });
        state.rafId = requestAnimationFrame(draw);
      };
      draw();
    } catch (_) { /* pas critique */ }
  }

  function stopMeter() {
    cancelAnimationFrame(state.rafId);
    els.levels.querySelectorAll("span").forEach((b) => { b.style.height = "6px"; b.style.opacity = ".35"; });
    if (state.audioCtx) { state.audioCtx.close().catch(() => {}); state.audioCtx = null; }
  }

  // --- Transcription + raffinage -------------------------------------------

  async function transcribe(blob) {
    setBusy(true);
    setStatus("ok", "Transcription…");
    els.hint.textContent = "Transcription en cours…";
    els.meta.textContent = "";

    const form = new FormData();
    form.append("audio", blob, "audio.webm");
    form.append("language", els.language.value);

    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const data = await res.json();
      let text = (data.text || "").trim();

      if (!text) {
        els.hint.textContent = "Aucune parole détectée.";
        setStatus("ok", "Prêt");
        return;
      }

      els.output.value = text;
      els.meta.textContent =
        `Langue : ${data.language} (${Math.round((data.language_probability || 0) * 100)}%) · ${data.duration}s`;

      if (els.autoRefine.checked) {
        await refine();
      } else {
        addHistory(els.output.value);
      }
      els.hint.textContent = "Cliquez sur le micro ou maintenez Espace pour dicter";
      setStatus("ok", "Prêt");
    } catch (e) {
      toast("Erreur : " + e.message);
      setStatus("err", "Erreur");
      els.hint.textContent = "Une erreur est survenue.";
    } finally {
      setBusy(false);
    }
  }

  async function refine() {
    const text = els.output.value.trim();
    if (!text) return;
    setBusy(true);
    setStatus("ok", "Raffinage…");
    const prevMeta = els.meta.textContent;
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: els.mode.value }),
      });
      const data = await res.json();
      if (data.text) {
        els.output.value = data.text;
        els.meta.textContent = `${prevMeta}${prevMeta ? " · " : ""}Raffiné (${data.provider})`;
        addHistory(data.text);
      }
    } catch (e) {
      toast("Raffinage indisponible : " + e.message);
    } finally {
      setBusy(false);
      setStatus("ok", "Prêt");
    }
  }

  function setBusy(v) {
    els.recordBtn.classList.toggle("busy", v);
    els.refineBtn.disabled = v;
  }

  // --- Historique ----------------------------------------------------------

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem("fw_history") || "[]"); }
    catch { return []; }
  }
  function saveHistory() {
    localStorage.setItem("fw_history", JSON.stringify(state.history.slice(0, 50)));
  }
  function addHistory(text) {
    if (!text) return;
    state.history.unshift({ text, ts: Date.now() });
    saveHistory();
    renderHistory();
  }
  function renderHistory() {
    els.historyList.innerHTML = state.history
      .map((h, i) => {
        const t = new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const safe = h.text.replace(/</g, "&lt;");
        return `<li data-i="${i}"><span class="text">${safe}</span><span class="time">${t}</span></li>`;
      })
      .join("");
  }

  els.historyList.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const item = state.history[+li.dataset.i];
    if (item) { els.output.value = item.text; toast("Chargé depuis l'historique."); }
  });
  els.clearHistory.addEventListener("click", () => {
    state.history = []; saveHistory(); renderHistory(); toast("Historique effacé.");
  });

  // --- Actions -------------------------------------------------------------

  els.recordBtn.addEventListener("click", () => (state.recording ? stopRecording() : startRecording()));
  els.refineBtn.addEventListener("click", refine);
  els.copyBtn.addEventListener("click", async () => {
    const text = els.output.value.trim();
    if (!text) return toast("Rien à copier.");
    try { await navigator.clipboard.writeText(text); toast("Copié dans le presse-papiers ✓"); }
    catch { toast("Copie impossible."); }
  });

  // Push-to-talk : maintenir Espace (hors saisie dans le textarea).
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.repeat && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "INPUT") {
      e.preventDefault();
      startRecording();
    }
  });
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space" && e.target.tagName !== "TEXTAREA" && e.target.tagName !== "INPUT") {
      e.preventDefault();
      stopRecording();
    }
  });

  // --- Init ----------------------------------------------------------------
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    setStatus("err", "Navigateur non compatible");
    toast("Ce navigateur ne supporte pas l'enregistrement audio.");
  }
  renderHistory();
  loadConfig();
})();
