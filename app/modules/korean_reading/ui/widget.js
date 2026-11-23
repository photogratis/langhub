/* =========================================================
   korean_reading/ui/widget.js
   - Web Audio API VAD (실제 발화 시작 ~ 종료 시점 정밀 측정)
   - MediaRecorder (모바일/PC 마이크 녹음)
   - Web Speech API (ko-KR 한국어 음성인식 & TTS 들어보기)
========================================================= */

var kreadingPassagesCache = [];
var selectedReadingPassage = null;

var krMediaStream = null;
var krMediaRecorder = null;
var krRecordedChunks = [];
var krAudioContext = null;
var krAnalyser = null;
var krVadAnimId = null;

var krSpeechRecognition = null;
var krFinalTranscript = "";
var krInterimTranscript = "";

var krIsRecording = false;
var krSpeechStarted = false;
var krActualStartMs = 0;
var krLastSpeechMs = 0;
var krSilenceAutoStopTimer = null;

function isReadingStaffUser() {
  if (!currentUser) return false;
  const g = String(currentUser.grade || "").trim().toUpperCase();
  return g === "ADMIN" || g === "TEACHER";
}

async function initKoreanReadingModule() {
  cleanupReadingAudioEngine();
  stopReadingTts();

  const token = localStorage.getItem("access_token");
  if (!currentUser && token) {
    try {
      const res = await fetch("/api/v1/auth/me", { headers: getAuthHeaders(false) });
      if (res.ok) currentUser = await res.json();
    } catch (e) {
      console.error(e);
    }
  }

  const isStaff = isReadingStaffUser();
  document.querySelectorAll(".kreading-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  switchKreadingTab("test");
}

function switchKreadingTab(tabName) {
  clearMsg();
  cleanupReadingAudioEngine();
  stopReadingTts();

  const tabs = ["test", "public", "my", "admin"];
  tabs.forEach(t => {
    const btn = document.getElementById(`kr-tab-${t}`);
    const view = document.getElementById(`kr-view-${t}`);
    if (btn) {
      btn.className = t === tabName
        ? (t === "admin" ? "kreading-staff-only" : "")
        : (t === "admin" ? "secondary kreading-staff-only" : "secondary");
    }
    if (view) view.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "test") {
    loadKreadingPassages();
  } else if (tabName === "public") {
    populatePublicPassageSelector();
  } else if (tabName === "my") {
    loadMyReadingAttempts();
  } else if (tabName === "admin") {
    loadAdminReadingPassages();
  }
}

/* =========================================================
   TTS 들어보기 (Web Speech API speechSynthesis)
========================================================= */
function speakActiveReadingPassage(rate = 1.0) {
  if (!selectedReadingPassage || !selectedReadingPassage.content) return;
  if (!("speechSynthesis" in window)) {
    return showMsg("현재 브라우저에서는 TTS 음성 합성을 지원하지 않습니다.", true);
  }

  stopReadingTts();

  const utterance = new SpeechSynthesisUtterance(selectedReadingPassage.content);
  utterance.lang = "ko-KR";
  utterance.rate = rate;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find(v => v.lang && v.lang.toLowerCase().includes("ko"));
  if (koVoice) utterance.voice = koVoice;

  const stopBtn = document.getElementById("kr-btn-tts-stop");
  utterance.onstart = () => {
    if (stopBtn) stopBtn.classList.remove("hidden");
  };
  utterance.onend = () => {
    if (stopBtn) stopBtn.classList.add("hidden");
  };
  utterance.onerror = () => {
    if (stopBtn) stopBtn.classList.add("hidden");
  };

  window.speechSynthesis.speak(utterance);
}

function stopReadingTts() {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  const stopBtn = document.getElementById("kr-btn-tts-stop");
  if (stopBtn) stopBtn.classList.add("hidden");
}

/* =========================================================
   탭 1: 읽기 지문 목록 및 테스트
========================================================= */
async function loadKreadingPassages() {
  const level = document.getElementById("kr-filter-level")?.value || "";
  const tag = document.getElementById("kr-filter-tag")?.value.trim() || "";
  const q = document.getElementById("kr-filter-q")?.value.trim() || "";

  const params = new URLSearchParams();
  if (level) params.append("level", level);
  if (tag) params.append("tag", tag);
  if (q) params.append("q", q);

  const res = await fetch(`/api/v1/modules/korean_reading/passages?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  const listEl = document.getElementById("kr-passage-list");
  if (!res.ok) {
    listEl.innerHTML = `<p style="color:#b91c1c;">지문 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  kreadingPassagesCache = await res.json();
  if (!kreadingPassagesCache.length) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">등록된 읽기 지문이 없습니다.</p>`;
    return;
  }

  listEl.innerHTML = kreadingPassagesCache.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <div>
          <span class="pos-badge">${p.level}</span>
          <strong style="font-size:15px; color:#0f172a; margin-left:6px;">${p.title}</strong>
          ${(p.tags || []).map(t => `<span class="tag" style="margin-left:4px;">#${t}</span>`).join("")}
        </div>
        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
          분량: <b>${p.char_count}음절 (${p.word_count}어절)</b> · 출제자: ${p.author_name || "선생님"}
        </div>
      </div>
      <button type="button" style="background:#2563eb; padding:8px 14px;" onclick="selectReadingPassageForTest('${p.id}')">
        이 지문 읽기
      </button>
    </div>
  `).join("");
}

function selectReadingPassageForTest(passageId) {
  cleanupReadingAudioEngine();
  stopReadingTts();

  const p = kreadingPassagesCache.find(item => item.id === passageId);
  if (!p) return;

  selectedReadingPassage = p;
  document.getElementById("kr-active-level").textContent = p.level;
  document.getElementById("kr-active-title").textContent = p.title;
  document.getElementById("kr-active-meta").innerHTML = `총 <b>${p.char_count}음절</b> · <b>${p.word_count}어절</b> · 작성자: ${p.author_name || "선생님"}`;
  document.getElementById("kr-active-content").textContent = p.content;

  document.getElementById("kr-vad-status").textContent = "대기 중 — 아래 [녹음 시작]을 누른 뒤 읽기 시작하세요";
  document.getElementById("kr-vad-status").style.color = "#38bdf8";
  document.getElementById("kr-live-timer").textContent = "0.00초";
  document.getElementById("kr-live-transcript").textContent = "";
  document.getElementById("kr-volume-bar").style.width = "0%";

  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
  document.getElementById("kr-result-box").classList.add("hidden");

  const studio = document.getElementById("kr-studio-box");
  studio.classList.remove("hidden");
  studio.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function startReadingRecording() {
  if (!selectedReadingPassage) return;
  clearMsg();
  cleanupReadingAudioEngine();
  stopReadingTts();

  try {
    krMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    return showMsg("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요.", true);
  }

  krRecordedChunks = [];
  krFinalTranscript = "";
  krInterimTranscript = "";
  krIsRecording = true;
  krSpeechStarted = false;
  krActualStartMs = 0;
  krLastSpeechMs = 0;

  const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];
  let chosenMime = "";
  for (const m of mimeCandidates) {
    if (!m || (window.MediaRecorder && MediaRecorder.isTypeSupported(m))) {
      chosenMime = m;
      break;
    }
  }
  krMediaRecorder = chosenMime
    ? new MediaRecorder(krMediaStream, { mimeType: chosenMime })
    : new MediaRecorder(krMediaStream);

  krMediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) krRecordedChunks.push(e.data);
  };
  krMediaRecorder.start(100);

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    krSpeechRecognition = new SpeechRec();
    krSpeechRecognition.lang = "ko-KR";
    krSpeechRecognition.continuous = true;
    krSpeechRecognition.interimResults = true;

    krSpeechRecognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          krFinalTranscript += txt + " ";
        } else {
          interim += txt;
        }
      }
      krInterimTranscript = interim;
      const now = performance.now();
      if (!krSpeechStarted && (krFinalTranscript.trim() || interim.trim())) {
        krSpeechStarted = true;
        krActualStartMs = now;
      }
      if (krSpeechStarted) {
        krLastSpeechMs = now;
      }
      const el = document.getElementById("kr-live-transcript");
      if (el) el.textContent = `인식된 발화: ${(krFinalTranscript + krInterimTranscript).trim()}`;
    };

    krSpeechRecognition.onerror = () => {};
    krSpeechRecognition.onend = () => {
      if (krIsRecording) {
        try {
          krSpeechRecognition.start();
        } catch {}
      }
    };
    try {
      krSpeechRecognition.start();
    } catch {}
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  krAudioContext = new AudioCtx();
  const source = krAudioContext.createMediaStreamSource(krMediaStream);
  krAnalyser = krAudioContext.createAnalyser();
  krAnalyser.fftSize = 512;
  source.connect(krAnalyser);

  const dataArray = new Uint8Array(krAnalyser.fftSize);
  const statusEl = document.getElementById("kr-vad-status");
  const timerEl = document.getElementById("kr-live-timer");
  const volBar = document.getElementById("kr-volume-bar");

  statusEl.textContent = "🎤 준비 완료! 첫 단어를 소리 내어 읽으면 카운트가 자동 시작됩니다...";
  statusEl.style.color = "#fbbf24";

  document.getElementById("kr-btn-start").classList.add("hidden");
  document.getElementById("kr-btn-stop").classList.remove("hidden");
  document.getElementById("kr-btn-cancel").classList.remove("hidden");

  const SPEECH_THRESHOLD = 0.028;

  function monitorAudioLoop() {
    if (!krIsRecording) return;

    krAnalyser.getByteTimeDomainData(dataArray);
    let sumSq = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const norm = (dataArray[i] - 128) / 128;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / dataArray.length);
    const pct = Math.min(100, Math.round(rms * 450));
    if (volBar) volBar.style.width = `${pct}%`;

    const now = performance.now();
    if (rms >= SPEECH_THRESHOLD) {
      if (!krSpeechStarted) {
        krSpeechStarted = true;
        krActualStartMs = now;
        statusEl.textContent = "🔴 발화 감지됨 — 속도 및 정확도 측정 중!";
        statusEl.style.color = "#4ade80";
      }
      krLastSpeechMs = now;
    }

    if (krSpeechStarted && timerEl) {
      const pureElapsedSec = Math.max(0, (krLastSpeechMs - krActualStartMs) / 1000);
      timerEl.textContent = `${pureElapsedSec.toFixed(2)}초`;
    }

    krVadAnimId = requestAnimationFrame(monitorAudioLoop);
  }
  krVadAnimId = requestAnimationFrame(monitorAudioLoop);
}

function cancelReadingRecording() {
  cleanupReadingAudioEngine();
  document.getElementById("kr-vad-status").textContent = "녹음이 취소되었습니다.";
  document.getElementById("kr-vad-status").style.color = "#94a3b8";
  document.getElementById("kr-live-timer").textContent = "0.00초";
  document.getElementById("kr-volume-bar").style.width = "0%";
  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
}

async function stopAndSubmitReading() {
  if (!krIsRecording || !selectedReadingPassage) return;

  if (!krSpeechStarted || krLastSpeechMs <= krActualStartMs) {
    cleanupReadingAudioEngine();
    document.getElementById("kr-btn-start").classList.remove("hidden");
    document.getElementById("kr-btn-stop").classList.add("hidden");
    document.getElementById("kr-btn-cancel").classList.add("hidden");
    return showMsg("실제 음성이 감지되지 않았습니다. 마이크에 가까이 대고 다시 읽어주세요.", true);
  }

  const pureDurationSec = Math.max(0.3, (krLastSpeechMs - krActualStartMs) / 1000);
  const fullTranscript = (krFinalTranscript + " " + krInterimTranscript).trim();
  const isPublic = Boolean(document.getElementById("kr-submit-public")?.checked);

  if (isPublic && !currentUser) {
    showMsg("비회원은 기록 공개가 제한되어 비공개 개인 결과로 채점됩니다.");
  }

  const statusEl = document.getElementById("kr-vad-status");
  statusEl.textContent = "⏳ 녹음 파일 저장 및 발음 정확도 분석 중...";
  statusEl.style.color = "#38bdf8";

  const audioBlob = await new Promise(resolve => {
    const mimeType = (krMediaRecorder && krMediaRecorder.mimeType) || "audio/webm";
    krMediaRecorder.onstop = () => {
      resolve(new Blob(krRecordedChunks, { type: mimeType }));
    };
    krMediaRecorder.stop();
  });

  cleanupReadingAudioEngine();

  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");

  const ext = audioBlob.type.includes("mp4") ? ".mp4" : ".webm";
  const formData = new FormData();
  formData.append("passage_id", selectedReadingPassage.id);
  formData.append("duration_seconds", pureDurationSec.toFixed(2));
  formData.append("recognized_text", fullTranscript);
  formData.append("is_public", String(isPublic));
  formData.append("audio_file", audioBlob, `reading_${Date.now()}${ext}`);

  const res = await fetch("/api/v1/modules/korean_reading/submit", {
    method: "POST",
    headers: getAuthHeaders(false),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    statusEl.textContent = "제출 실패";
    return showMsg(data.detail || "채점 저장 오류", true);
  }

  statusEl.textContent = "✅ 측정 완료!";
  statusEl.style.color = "#4ade80";
  renderReadingResultReport(data);
}

function renderReadingResultReport(data) {
  const box = document.getElementById("kr-result-box");
  box.classList.remove("hidden");

  const diffHtml = (data.diff_tokens || []).map(tok => `
    <span style="display:inline-block; padding:2px 5px; margin:2px; border-radius:4px; font-weight:700; ${
      tok.matched
        ? "background:#dcfce7; color:#166534;"
        : "background:#fee2e2; color:#b91c1c; text-decoration:underline wavy #dc2626;"
    }">${tok.word}</span>
  `).join(" ");

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
      <strong style="font-size:16px; color:#14532d;">📊 읽기 평가 리포트 — ${data.passage_title || ""}</strong>
      <span class="tag" style="background:${data.is_public ? "#2563eb" : "#475569"}; color:#fff;">
        ${data.is_public ? "공개 기록 등록됨" : "비공개 기록"}
      </span>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:12px;">
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">발음·내용 정확도</div>
        <div style="font-size:26px; font-weight:900; color:#16a34a;">${data.accuracy_score}%</div>
      </div>
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">읽기 속도 (분당 음절)</div>
        <div style="font-size:26px; font-weight:900; color:#2563eb;">${data.cpm} <span style="font-size:13px;">CPM</span></div>
      </div>
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">순수 발화 시간</div>
        <div style="font-size:26px; font-weight:900; color:#0f172a;">${data.duration_seconds}초</div>
      </div>
    </div>

    <div style="background:#fff; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px;">
      <div style="font-size:12px; color:#64748b; margin-bottom:6px;">어절별 정확도 분석 (초록: 정확 / 빨강: 누락·오독 의심)</div>
      <div style="font-size:15px; line-height:1.8;">${diffHtml}</div>
      ${data.recognized_text ? `<div style="margin-top:8px; font-size:12.5px; color:#475569;"><b>인식된 텍스트:</b> ${data.recognized_text}</div>` : ""}
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <audio controls src="${data.audio_url}" style="height:36px; flex:1; min-width:220px;"></audio>
      <button type="button" style="background:#0284c7;" onclick="selectReadingPassageForTest('${data.passage_id}')">
        🔄 다시 도전하기
      </button>
    </div>
  `;
}

function cleanupReadingAudioEngine() {
  krIsRecording = false;
  if (krVadAnimId) {
    cancelAnimationFrame(krVadAnimId);
    krVadAnimId = null;
  }
  if (krSilenceAutoStopTimer) {
    clearTimeout(krSilenceAutoStopTimer);
    krSilenceAutoStopTimer = null;
  }
  if (krSpeechRecognition) {
    try {
      krSpeechRecognition.stop();
    } catch {}
    krSpeechRecognition = null;
  }
  if (krMediaRecorder && krMediaRecorder.state !== "inactive") {
    try {
      krMediaRecorder.stop();
    } catch {}
  }
  if (krMediaStream) {
    krMediaStream.getTracks().forEach(t => t.stop());
    krMediaStream = null;
  }
  if (krAudioContext) {
    try {
      krAudioContext.close();
    } catch {}
    krAudioContext = null;
  }
}

/* =========================================================
   탭 2: 공개 기록 듣기 & 랭킹 (전체 지문 통합 보기 + 지문별 필터 모두 지원)
========================================================= */
async function populatePublicPassageSelector() {
  if (!kreadingPassagesCache.length) {
    const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
    if (res.ok) kreadingPassagesCache = await res.json();
  }

  const sel = document.getElementById("kr-public-passage-select");
  const allOption = `<option value="ALL">🌐 전체 지문 공개 기록 모두 보기</option>`;
  const passageOptions = kreadingPassagesCache
    .map(p => `<option value="${p.id}">[${p.level}] ${p.title} (${p.char_count}음절)</option>`)
    .join("");

  sel.innerHTML = allOption + passageOptions;
  sel.value = "ALL";
  loadPublicAttemptsForSelectedPassage();
}

async function loadPublicAttemptsForSelectedPassage() {
  const passageId = document.getElementById("kr-public-passage-select")?.value || "ALL";
  const sortBy = document.getElementById("kr-public-sort")?.value || "recent";
  const container = document.getElementById("kr-public-attempts-list");

  const endpoint = passageId === "ALL"
    ? `/api/v1/modules/korean_reading/public-attempts?sort_by=${sortBy}`
    : `/api/v1/modules/korean_reading/passages/${passageId}/public-attempts?sort_by=${sortBy}`;

  const res = await fetch(endpoint, { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">공개 기록을 불러오지 못했습니다.</p>`;
    return;
  }

  const items = await res.json();
  if (!items.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">아직 공개된 읽기 기록이 없습니다. 첫 번째 공개 기록의 주인공이 되어 보세요!</p>`;
    return;
  }

  container.innerHTML = items.map((item, idx) => {
    const pInfo = item.reading_passages;
    const pBadge = pInfo
      ? `<span class="pos-badge" style="margin-left:6px;">[${pInfo.level}] ${pInfo.title}</span>`
      : "";

    return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <span class="tag" style="background:${idx === 0 ? "#f59e0b" : "#334155"}; color:#fff;">#${idx + 1}</span>
            <strong style="font-size:15px; margin-left:6px;">${item.user_nickname}</strong>
            ${pBadge}
            <span style="font-size:12px; color:#64748b; margin-left:6px;">${new Date(item.created_at).toLocaleDateString()}</span>
          </div>
          <div style="font-size:13.5px;">
            정확도 <b style="color:#16a34a;">${item.accuracy_score}%</b> · 속도 <b style="color:#2563eb;">${item.cpm} CPM</b> (${item.duration_seconds}초)
          </div>
        </div>
        <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
      </div>
    `;
  }).join("");
}

/* =========================================================
   탭 3: 내 읽기 기록 & 공개/비공개 전환 & 삭제
========================================================= */
async function loadMyReadingAttempts() {
  const container = document.getElementById("kr-my-attempts-list");
  if (!currentUser) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">로그인하시면 내 읽기 측정 기록과 공개 설정·삭제 관리가 가능합니다.</p>`;
    return;
  }

  const res = await fetch("/api/v1/modules/korean_reading/my-attempts", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">내 기록을 불러오지 못했습니다.</p>`;
    return;
  }

  const items = await res.json();
  if (!items.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">아직 응시한 읽기 기록이 없습니다.</p>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const pTitle = item.reading_passages?.title || "지문";
    return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong>${pTitle}</strong>
            <span style="font-size:12px; color:#64748b; margin-left:6px;">${new Date(item.created_at).toLocaleString()}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:13px; margin-right:4px;">정확도 <b>${item.accuracy_score}%</b> · <b>${item.cpm} CPM</b> (${item.duration_seconds}초)</span>
            <button type="button" class="${item.is_public ? "" : "secondary"}" style="padding:4px 10px; font-size:12px;" onclick="toggleMyReadingVisibility('${item.id}', ${!item.is_public})">
              ${item.is_public ? "🌐 공개 중 (비공개 전환)" : "🔒 비공개 (공개하기)"}
            </button>
            <button type="button" style="background:#dc2626; padding:4px 10px; font-size:12px;" onclick="deleteMyReadingAttempt('${item.id}')">
              🗑️ 삭제
            </button>
          </div>
        </div>
        <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
      </div>
    `;
  }).join("");
}

async function toggleMyReadingVisibility(attemptId, nextPublic) {
  const res = await fetch(`/api/v1/modules/korean_reading/attempts/${attemptId}/visibility`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ is_public: nextPublic }),
  });
  if (!res.ok) return showMsg("공개 설정 변경 실패", true);
  showMsg(nextPublic ? "기록이 공개되어 다른 학습자도 들을 수 있습니다." : "기록이 비공개로 전환되었습니다.");
  loadMyReadingAttempts();
}

async function deleteMyReadingAttempt(attemptId) {
  if (!confirm("이 녹음 기록을 영구 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/attempts/${attemptId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "녹음 삭제에 실패했습니다.", true);
  showMsg("녹음 기록이 삭제되었습니다.");
  loadMyReadingAttempts();
}

/* =========================================================
   탭 4: 지문 등록 · 수정 · 삭제 (관리자 & 선생님)
========================================================= */
async function handleCreateReadingPassage(e) {
  e.preventDefault();
  clearMsg();

  const title = document.getElementById("kr-new-title").value.trim();
  const level = document.getElementById("kr-new-level").value;
  const tags = document.getElementById("kr-new-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const content = document.getElementById("kr-new-content").value.trim();

  const res = await fetch("/api/v1/modules/korean_reading/passages", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, level, tags, content }),
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "지문 등록 실패", true);

  e.target.reset();
  showMsg("새 읽기 지문이 등록되었습니다!");
  loadAdminReadingPassages();
}

function openEditReadingPassage(passageId) {
  const p = kreadingPassagesCache.find(item => item.id === passageId);
  if (!p) return;

  document.getElementById("kr-edit-id").value = p.id;
  document.getElementById("kr-edit-title").value = p.title || "";
  document.getElementById("kr-edit-level").value = p.level || "초급";
  document.getElementById("kr-edit-tags").value = (p.tags || []).join(", ");
  document.getElementById("kr-edit-content").value = p.content || "";

  const box = document.getElementById("kr-edit-passage-box");
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEditReadingPassage() {
  const box = document.getElementById("kr-edit-passage-box");
  if (box) box.classList.add("hidden");
}

async function handleUpdateReadingPassage(e) {
  e.preventDefault();
  clearMsg();

  const passageId = document.getElementById("kr-edit-id").value;
  const title = document.getElementById("kr-edit-title").value.trim();
  const level = document.getElementById("kr-edit-level").value;
  const tags = document.getElementById("kr-edit-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const content = document.getElementById("kr-edit-content").value.trim();

  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ title, level, tags, content }),
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "지문 수정 실패", true);

  closeEditReadingPassage();
  showMsg("읽기 지문이 수정되었습니다.");
  loadAdminReadingPassages();
}

async function loadAdminReadingPassages() {
  const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
  const container = document.getElementById("kr-admin-passage-list");
  if (!res.ok) return;

  const list = await res.json();
  kreadingPassagesCache = list;
  container.innerHTML = list.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
      <div>
        <span class="pos-badge">${p.level}</span>
        <strong style="margin-left:6px;">${p.title}</strong>
        <span style="font-size:12px; color:#64748b; margin-left:6px;">(${p.char_count}음절 · 작성자: ${p.author_name || "선생님"})</span>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" style="background:#0284c7; padding:6px 10px; font-size:12px;" onclick="openEditReadingPassage('${p.id}')">✏️ 수정</button>
        <button type="button" style="background:#dc2626; padding:6px 10px; font-size:12px;" onclick="deleteReadingPassage('${p.id}')">삭제</button>
      </div>
    </div>
  `).join("");
}

async function deleteReadingPassage(passageId) {
  if (!confirm("이 지문과 연결된 기록을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("삭제 권한이 없거나 실패했습니다.", true);
  showMsg("지문이 삭제되었습니다.");
  loadAdminReadingPassages();
}