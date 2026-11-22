var krMediaStream = null, krMediaRecorder = null, krRecordedChunks = [], krChosenMime = "";
var krAudioContext = null, krAnalyser = null, krVadAnimId = null;
var krSpeechRecognition = null, krFinalTranscript = "", krInterimTranscript = "";
var krIsRecording = false, krSpeechStarted = false, krActualStartMs = 0, krLastSpeechMs = 0;

async function loadKreadingPassages() {
  const params = new URLSearchParams();
  const level = document.getElementById("kr-filter-level")?.value || "";
  const tag = document.getElementById("kr-filter-tag")?.value.trim() || "";
  const q = document.getElementById("kr-filter-q")?.value.trim() || "";
  if (level) params.append("level", level);
  if (tag) params.append("tag", tag);
  if (q) params.append("q", q);

  const res = await fetch(`/api/v1/modules/korean_reading/passages?${params}`, { headers: getAuthHeaders(false) });
  const listEl = document.getElementById("kr-passage-list");
  if (!res.ok) return (listEl.innerHTML = `<p style="color:#b91c1c;">지문 목록 로드 실패</p>`);

  kreadingPassagesCache = await res.json();
  if (!kreadingPassagesCache.length) {
    return (listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">등록된 읽기 지문이 없습니다.</p>`);
  }

  listEl.innerHTML = kreadingPassagesCache.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <span class="pos-badge">${p.level}</span>
        <strong style="font-size:15px; margin-left:6px;">${p.title}</strong>
        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">${p.char_count}음절 (${p.word_count}어절) · ${p.author_name || "선생님"}</div>
      </div>
      <button type="button" style="background:#2563eb;" onclick="selectReadingPassageForTest('${p.id}')">이 지문 읽기</button>
    </div>
  `).join("");
}

function selectReadingPassageForTest(passageId) {
  cleanupReadingAudioEngine();
  const p = kreadingPassagesCache.find(item => item.id === passageId);
  if (!p) return;

  selectedReadingPassage = p;
  document.getElementById("kr-active-level").textContent = p.level;
  document.getElementById("kr-active-title").textContent = p.title;
  document.getElementById("kr-active-meta").innerHTML = `총 <b>${p.char_count}음절</b> · <b>${p.word_count}어절</b>`;
  document.getElementById("kr-active-content").textContent = p.content;
  document.getElementById("kr-vad-status").textContent = "대기 중 — [녹음 시작]을 누른 뒤 읽으세요";
  document.getElementById("kr-live-timer").textContent = "0.00초";
  document.getElementById("kr-live-transcript").textContent = "";
  document.getElementById("kr-volume-bar").style.width = "0%";
  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
  document.getElementById("kr-result-box").classList.add("hidden");
  document.getElementById("kr-studio-box").classList.remove("hidden");
}

async function startReadingRecording() {
  if (!selectedReadingPassage) return;
  cleanupReadingAudioEngine();

  try {
    krMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
  } catch {
    return showMsg("마이크 접근 권한이 필요합니다.", true);
  }

  krRecordedChunks = []; krChosenMime = ""; krFinalTranscript = ""; krInterimTranscript = "";
  krIsRecording = true; krSpeechStarted = false; krActualStartMs = 0; krLastSpeechMs = 0;

  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { krChosenMime = m; break; }
  }
  krMediaRecorder = krChosenMime ? new MediaRecorder(krMediaStream, { mimeType: krChosenMime }) : new MediaRecorder(krMediaStream);
  krMediaRecorder.ondataavailable = e => { if (e.data?.size > 0) krRecordedChunks.push(e.data); };
  krMediaRecorder.start();

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    krSpeechRecognition = new SpeechRec();
    krSpeechRecognition.lang = "ko-KR"; krSpeechRecognition.continuous = true; krSpeechRecognition.interimResults = true;
    krSpeechRecognition.onresult = ev => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) krFinalTranscript += ev.results[i][0].transcript + " ";
        else interim += ev.results[i][0].transcript;
      }
      krInterimTranscript = interim;
      const now = performance.now();
      if (!krSpeechStarted && (krFinalTranscript.trim() || interim.trim())) { krSpeechStarted = true; krActualStartMs = now; }
      if (krSpeechStarted) krLastSpeechMs = now;
      const el = document.getElementById("kr-live-transcript");
      if (el) el.textContent = `인식된 발화: ${(krFinalTranscript + krInterimTranscript).trim()}`;
    };
    krSpeechRecognition.onend = () => { if (krIsRecording) try { krSpeechRecognition.start(); } catch {} };
    try { krSpeechRecognition.start(); } catch {}
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  krAudioContext = new AudioCtx();
  const source = krAudioContext.createMediaStreamSource(krMediaStream);
  krAnalyser = krAudioContext.createAnalyser(); krAnalyser.fftSize = 512;
  source.connect(krAnalyser);

  const dataArray = new Uint8Array(krAnalyser.fftSize);
  const statusEl = document.getElementById("kr-vad-status");
  statusEl.textContent = "🎤 준비 완료! 소리 내어 읽으면 카운트가 시작됩니다...";
  document.getElementById("kr-btn-start").classList.add("hidden");
  document.getElementById("kr-btn-stop").classList.remove("hidden");
  document.getElementById("kr-btn-cancel").classList.remove("hidden");

  function loop() {
    if (!krIsRecording) return;
    krAnalyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) { const n = (dataArray[i] - 128) / 128; sum += n * n; }
    const rms = Math.sqrt(sum / dataArray.length);
    document.getElementById("kr-volume-bar").style.width = `${Math.min(100, Math.round(rms * 450))}%`;

    const now = performance.now();
    if (rms >= 0.025) {
      if (!krSpeechStarted) { krSpeechStarted = true; krActualStartMs = now; statusEl.textContent = "🔴 발화 측정 중..."; }
      krLastSpeechMs = now;
    }
    if (krSpeechStarted) document.getElementById("kr-live-timer").textContent = `${Math.max(0, (krLastSpeechMs - krActualStartMs) / 1000).toFixed(2)}초`;
    krVadAnimId = requestAnimationFrame(loop);
  }
  krVadAnimId = requestAnimationFrame(loop);
}

function cancelReadingRecording() {
  cleanupReadingAudioEngine();
  document.getElementById("kr-vad-status").textContent = "녹음이 취소되었습니다.";
  document.getElementById("kr-live-timer").textContent = "0.00초";
  document.getElementById("kr-volume-bar").style.width = "0%";
  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
}

async function stopAndSubmitReading() {
  if (!krIsRecording || !selectedReadingPassage) return;
  if (!krSpeechStarted || krLastSpeechMs <= krActualStartMs) {
    cancelReadingRecording();
    return showMsg("음성이 감지되지 않았습니다. 다시 읽어주세요.", true);
  }

  const pureSec = Math.max(0.3, (krLastSpeechMs - krActualStartMs) / 1000);
  const fullText = (krFinalTranscript + " " + krInterimTranscript).trim();
  const isPublic = Boolean(document.getElementById("kr-submit-public")?.checked);

  const audioBlob = await new Promise(resolve => {
    const mime = krMediaRecorder?.mimeType || krChosenMime || "audio/webm";
    krMediaRecorder.onstop = () => resolve(new Blob(krRecordedChunks, { type: mime }));
    krMediaRecorder.stop();
  });
  cancelReadingRecording();

  const ext = audioBlob.type.includes("mp4") ? ".mp4" : audioBlob.type.includes("ogg") ? ".ogg" : ".webm";
  const fd = new FormData();
  fd.append("passage_id", selectedReadingPassage.id);
  fd.append("duration_seconds", pureSec.toFixed(2));
  fd.append("recognized_text", fullText);
  fd.append("is_public", String(isPublic));
  fd.append("audio_file", audioBlob, `reading_${Date.now()}${ext}`);

  const res = await fetch("/api/v1/modules/korean_reading/submit", { method: "POST", headers: getAuthHeaders(false), body: fd });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "채점 오류", true);

  const box = document.getElementById("kr-result-box");
  box.classList.remove("hidden");
  box.innerHTML = `
    <h4>📊 읽기 평가 리포트 — 정확도 ${data.accuracy_score}% · ${data.cpm} CPM (${data.duration_seconds}초)</h4>
    <p style="line-height:1.8;">${(data.diff_tokens || []).map(t => `<span style="padding:2px 4px; margin:2px; border-radius:4px; background:${t.matched ? "#dcfce7" : "#fee2e2"};">${t.word}</span>`).join(" ")}</p>
    <audio controls src="${data.audio_url}" style="width:100%; height:36px;"></audio>
  `;
}

function cleanupReadingAudioEngine() {
  krIsRecording = false;
  if (krVadAnimId) { cancelAnimationFrame(krVadAnimId); krVadAnimId = null; }
  if (krSpeechRecognition) { try { krSpeechRecognition.stop(); } catch {} krSpeechRecognition = null; }
  if (krMediaRecorder && krMediaRecorder.state !== "inactive") { try { krMediaRecorder.stop(); } catch {} }
  if (krMediaStream) { krMediaStream.getTracks().forEach(t => t.stop()); krMediaStream = null; }
  if (krAudioContext) { try { krAudioContext.close(); } catch {} krAudioContext = null; }
}