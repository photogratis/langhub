/* =========================================================
   korean_youtube/ui/widget.js
   - YouTube IFrame Player API 동적 로드 및 재생 위치(getCurrentTime) 동기화
   - 자막 클릭 시 해당 타임스탬프로 seekTo 이동
   - 자막 없는 영상용 Web Speech API + 플레이어 현재시간 결합 STT 캡처
========================================================= */

var kytVideosCache = [];
var activeKytVideo = null;
var kytYtPlayer = null;
var kytSyncInterval = null;
var kytCurrentLineIdx = -1;

var kytDraftSubtitles = [];
var kytDraftSource = "MANUAL";
var kytAdminPreviewPlayer = null;
var kytAdminSpeechRec = null;
var kytAdminSttRunning = false;

function isKytStaff() {
  if (!currentUser) return false;
  const g = String(currentUser.grade || "").trim().toUpperCase();
  return g === "ADMIN" || g === "TEACHER";
}

function ensureYoutubeIframeApi() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) {
      return resolve();
    }
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prevReady === "function") prevReady();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  });
}

async function initKoreanYoutubeModule() {
  stopKytSyncLoop();
  stopAdminSttCapture();

  const isStaff = isKytStaff();
  document.querySelectorAll(".kyt-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  switchKytTab("study");
}

function switchKytTab(tabName) {
  clearMsg();
  stopKytSyncLoop();
  stopAdminSttCapture();

  ["study", "admin"].forEach(t => {
    const btn = document.getElementById(`kyt-tab-${t}`);
    const view = document.getElementById(`kyt-view-${t}`);
    if (btn) {
      btn.className = t === tabName
        ? (t === "admin" ? "kyt-staff-only" : "")
        : (t === "admin" ? "secondary kyt-staff-only" : "secondary");
    }
    if (view) view.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "study") {
    loadKytVideos();
  } else if (tabName === "admin") {
    loadAdminKytVideos();
  }
}

/* =========================================================
   학습자 영역: 목록 조회 및 IFrame 타임스탬프 싱크 플레이어
========================================================= */
async function loadKytVideos() {
  const level = document.getElementById("kyt-filter-level")?.value || "";
  const tag = document.getElementById("kyt-filter-tag")?.value.trim() || "";
  const q = document.getElementById("kyt-filter-q")?.value.trim() || "";

  const params = new URLSearchParams();
  if (level) params.append("level", level);
  if (tag) params.append("tag", tag);
  if (q) params.append("q", q);

  const res = await fetch(`/api/v1/modules/korean_youtube/videos?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  const listEl = document.getElementById("kyt-video-list");
  if (!res.ok) {
    listEl.innerHTML = `<p style="color:#b91c1c;">영상 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  kytVideosCache = await res.json();
  if (!kytVideosCache.length) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">등록된 유튜브 학습 자료가 없습니다.</p>`;
    return;
  }

  listEl.innerHTML = kytVideosCache.map(v => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <img src="https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg" alt="thumb" style="width:110px; height:62px; object-fit:cover; border-radius:6px; border:1px solid #e2e8f0;" />
        <div>
          <div>
            <span class="pos-badge">${v.level}</span>
            <strong style="font-size:15px; color:#0f172a; margin-left:6px;">${v.title}</strong>
            ${(v.tags || []).map(t => `<span class="tag" style="margin-left:4px;">#${t}</span>`).join("")}
          </div>
          <div style="font-size:12px; color:#64748b; margin-top:4px;">
            자막 ${(v.subtitles || []).length}문장 · 등록자: ${v.author_name || "선생님"}
          </div>
        </div>
      </div>
      <button type="button" style="background:#2563eb; padding:8px 14px;" onclick="openKytPlayer('${v.id}')">
        ▶️ 학습 시작
      </button>
    </div>
  `).join("");
}

async function openKytPlayer(itemId) {
  const item = kytVideosCache.find(v => v.id === itemId);
  if (!item) return;

  activeKytVideo = item;
  kytCurrentLineIdx = -1;
  stopKytSyncLoop();

  document.getElementById("kyt-active-level").textContent = item.level;
  document.getElementById("kyt-active-title").textContent = item.title;
  document.getElementById("kyt-active-desc").textContent = item.description || "";

  const studio = document.getElementById("kyt-player-studio");
  studio.classList.remove("hidden");
  renderKytSubtitleTimeline();
  studio.scrollIntoView({ behavior: "smooth", block: "nearest" });

  await ensureYoutubeIframeApi();

  if (kytYtPlayer && typeof kytYtPlayer.loadVideoById === "function") {
    kytYtPlayer.loadVideoById(item.video_id);
  } else {
    kytYtPlayer = new YT.Player("kyt-iframe-target", {
      videoId: item.video_id,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onReady: () => startKytSyncLoop(),
      },
    });
  }
  startKytSyncLoop();
}

function formatSecToTimestamp(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function renderKytSubtitleTimeline() {
  const container = document.getElementById("kyt-subtitle-timeline");
  if (!container || !activeKytVideo) return;

  const showId = Boolean(document.getElementById("kyt-show-id")?.checked);
  const subs = activeKytVideo.subtitles || [];

  if (!subs.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px;">저장된 자막이 없습니다.</p>`;
    return;
  }

  container.innerHTML = subs.map((line, idx) => `
    <div id="kyt-sub-row-${idx}"
      onclick="seekKytToTime(${line.start})"
      style="padding:9px 10px; border-radius:8px; margin-bottom:6px; cursor:pointer; border:1px solid #e2e8f0; background:#fff; transition:background 0.15s;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <span style="font-size:11.5px; font-weight:700; color:#2563eb;">⏱ ${formatSecToTimestamp(line.start)}</span>
        <span style="font-size:10.5px; color:#94a3b8;">${line.source || ""}</span>
      </div>
      <div style="font-size:15px; font-weight:700; color:#0f172a; line-height:1.45;">${line.ko || ""}</div>
      ${showId && line.id ? `<div style="font-size:13px; color:#475569; margin-top:3px;">${line.id}</div>` : ""}
    </div>
  `).join("");
}

function seekKytToTime(sec) {
  if (kytYtPlayer && typeof kytYtPlayer.seekTo === "function") {
    kytYtPlayer.seekTo(Number(sec) || 0, true);
    kytYtPlayer.playVideo();
  }
}

function startKytSyncLoop() {
  stopKytSyncLoop();
  kytSyncInterval = setInterval(() => {
    if (!kytYtPlayer || typeof kytYtPlayer.getCurrentTime !== "function" || !activeKytVideo) return;

    const now = Number(kytYtPlayer.getCurrentTime() || 0);
    const timeBadge = document.getElementById("kyt-current-time-badge");
    if (timeBadge) timeBadge.textContent = formatSecToTimestamp(now);

    const subs = activeKytVideo.subtitles || [];
    let matchedIdx = -1;
    for (let i = 0; i < subs.length; i++) {
      const st = Number(subs[i].start || 0);
      const ed = Number(subs[i].end || (st + 3));
      if (now >= st - 0.15 && now <= ed + 0.15) {
        matchedIdx = i;
        break;
      }
    }

    if (matchedIdx !== -1 && matchedIdx !== kytCurrentLineIdx) {
      if (kytCurrentLineIdx >= 0) {
        const prevEl = document.getElementById(`kyt-sub-row-${kytCurrentLineIdx}`);
        if (prevEl) {
          prevEl.style.background = "#fff";
          prevEl.style.borderColor = "#e2e8f0";
        }
      }

      kytCurrentLineIdx = matchedIdx;
      const curEl = document.getElementById(`kyt-sub-row-${matchedIdx}`);
      if (curEl) {
        curEl.style.background = "#eff6ff";
        curEl.style.borderColor = "#3b82f6";
        if (document.getElementById("kyt-auto-scroll")?.checked) {
          curEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    }
  }, 200);
}

function stopKytSyncLoop() {
  if (kytSyncInterval) {
    clearInterval(kytSyncInterval);
    kytSyncInterval = null;
  }
}

/* =========================================================
   관리자/선생님 영역: 자막 추출 & STT 타임스탬프 캡처 & 저장
========================================================= */
async function extractSubtitlesFromUrl() {
  clearMsg();
  const url = document.getElementById("kyt-new-url")?.value.trim();
  if (!url) return showMsg("유튜브 URL을 입력해 주세요.", true);

  const videoIdMatch = url.match(/(?:v=|\/|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : "";
  if (!videoId) return showMsg("유효한 유튜브 URL이 아닙니다.", true);

  showMsg("유튜브 자막 및 자동번역 데이터를 가져오는 중입니다...");
  const res = await fetch("/api/v1/modules/korean_youtube/extract-subtitles", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ youtube_url: url, auto_translate_id: true }),
  });
  const data = await res.json().catch(() => ({}));

  // 미리보기 플레이어 및 STT 캡처 도구는 성공/실패 여부와 무관하게 항상 활성화
  const sttBox = document.getElementById("kyt-stt-capture-box");
  if (sttBox) sttBox.classList.remove("hidden");
  await ensureYoutubeIframeApi();
  if (kytAdminPreviewPlayer && typeof kytAdminPreviewPlayer.loadVideoById === "function") {
    kytAdminPreviewPlayer.loadVideoById(videoId);
  } else {
    kytAdminPreviewPlayer = new YT.Player("kyt-admin-preview-player", {
      videoId: videoId,
      playerVars: { rel: 0, playsinline: 1 },
    });
  }

  if (!res.ok) {
    kytDraftSource = "MANUAL_PASTE";
    return showMsg(
      "클라우드 서버 IP 차단으로 자동 추출이 제한되었습니다. 아래 [자막 텍스트/SRT 붙여넣기] 또는 [음성인식 캡처]를 이용해 주세요.",
      true
    );
  }

  kytDraftSource = data.subtitle_source || "YOUTUBE_CAPTION";
  kytDraftSubtitles = data.subtitles || [];
  renderDraftSubtitlesEditor();

  if (data.has_captions) {
    showMsg(`총 ${kytDraftSubtitles.length}개 문장의 타임스탬프 자막을 추출했습니다.`);
  } else {
    showMsg(data.message || "자막이 없는 영상입니다. 아래 도구로 자막을 추가해 주세요.", true);
  }
}

// 유튜브 스크립트 복사본(0:05 안녕하세요) 또는 SRT 형식을 타임스탬프 데이터로 자동 파싱
function parsePastedYoutubeTranscript() {
  const raw = document.getElementById("kyt-paste-transcript")?.value || "";
  if (!raw.trim()) return showMsg("붙여넣을 자막 텍스트를 입력해 주세요.", true);

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];
  const timeRegex = /^(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?$/;

  for (let i = 0; i < lines.length; i++) {
    // SRT 블록 번호 건너뛰기
    if (/^\d+$/.test(lines[i]) && i + 1 < lines.length && lines[i + 1].includes("-->")) {
      continue;
    }
    // SRT 시간 범위 (00:00:01,200 --> 00:00:04,500)
    if (lines[i].includes("-->")) {
      const [startStr, endStr] = lines[i].split("-->").map(s => s.trim().replace(",", "."));
      const start = _timeStrToSec(startStr);
      const end = _timeStrToSec(endStr);
      const textLines = [];
      while (i + 1 < lines.length && !/^\d+$/.test(lines[i + 1]) && !lines[i + 1].includes("-->")) {
        i++;
        textLines.push(lines[i]);
      }
      if (textLines.length) {
        parsed.push({ start, end, ko: textLines.join(" "), id: "", source: "SRT_PASTE" });
      }
      continue;
    }
    // 유튜브 웹페이지 [스크립트 표시] 복사 형식 (예: "0:12" 다음 줄 "안녕하세요")
    if (timeRegex.test(lines[i])) {
      const start = _timeStrToSec(lines[i]);
      const text = (i + 1 < lines.length && !timeRegex.test(lines[i + 1])) ? lines[++i] : "";
      if (text) {
        parsed.push({ start, end: start + 3, ko: text, id: "", source: "YT_COPY" });
      }
    }
  }

  // 종료 시간(end)을 다음 자막 시작 시간으로 자동 보정
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i + 1].start > parsed[i].start) {
      parsed[i].end = parsed[i + 1].start;
    }
  }

  if (!parsed.length) {
    return showMsg("인식된 타임스탬프 형식이 없습니다. 유튜브 '스크립트 표시' 복사본 또는 SRT 형식을 붙여넣어 주세요.", true);
  }

  kytDraftSubtitles = parsed;
  kytDraftSource = "PASTED_TRANSCRIPT";
  renderDraftSubtitlesEditor();
  showMsg(`총 ${parsed.length}개 자막 줄이 타임스탬프와 함께 변환되었습니다!`);
}

function _timeStrToSec(tStr) {
  const parts = String(tStr || "0").split(":").map(Number);
  if (parts.length === 3) return Number((parts[0] * 3600 + parts[1] * 60 + parts[2]).toFixed(2));
  if (parts.length === 2) return Number((parts[0] * 60 + parts[1]).toFixed(2));
  return Number((parts[0] || 0).toFixed(2));
}

function startAdminSttCapture() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    return showMsg("현재 브라우저에서는 Web Speech API 음성인식을 지원하지 않습니다. Chrome을 이용해 주세요.", true);
  }

  stopAdminSttCapture();
  kytAdminSttRunning = true;
  kytDraftSource = "STT_CAPTURE";

  document.getElementById("kyt-btn-stt-start").classList.add("hidden");
  document.getElementById("kyt-btn-stt-stop").classList.remove("hidden");
  document.getElementById("kyt-stt-live-status").textContent = "🔴 영상 재생 소리를 인식하여 타임스탬프 기록 중...";

  let segmentStartSec = 0;
  kytAdminSpeechRec = new SpeechRec();
  kytAdminSpeechRec.lang = "ko-KR";
  kytAdminSpeechRec.continuous = true;
  kytAdminSpeechRec.interimResults = true;

  kytAdminSpeechRec.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const currentVidTime =
        kytAdminPreviewPlayer && typeof kytAdminPreviewPlayer.getCurrentTime === "function"
          ? Number(kytAdminPreviewPlayer.getCurrentTime() || 0)
          : 0;

      if (!segmentStartSec) {
        segmentStartSec = Math.max(0, Number((currentVidTime - 0.5).toFixed(2)));
      }

      if (event.results[i].isFinal) {
        const text = event.results[i][0].transcript.trim();
        if (text) {
          kytDraftSubtitles.push({
            start: segmentStartSec,
            end: Number(currentVidTime.toFixed(2)),
            ko: text,
            id: "",
            source: "STT",
          });
          renderDraftSubtitlesEditor();
        }
        segmentStartSec = 0;
      }
    }
  };

  kytAdminSpeechRec.onend = () => {
    if (kytAdminSttRunning) {
      try { kytAdminSpeechRec.start(); } catch {}
    }
  };
  kytAdminSpeechRec.start();
}

function stopAdminSttCapture() {
  kytAdminSttRunning = false;
  if (kytAdminSpeechRec) {
    try { kytAdminSpeechRec.stop(); } catch {}
    kytAdminSpeechRec = null;
  }
  const startBtn = document.getElementById("kyt-btn-stt-start");
  const stopBtn = document.getElementById("kyt-btn-stt-stop");
  const statusEl = document.getElementById("kyt-stt-live-status");
  if (startBtn) startBtn.classList.remove("hidden");
  if (stopBtn) stopBtn.classList.add("hidden");
  if (statusEl) statusEl.textContent = "대기 중";
}

function addManualSubtitleRow() {
  const lastEnd = kytDraftSubtitles.length ? Number(kytDraftSubtitles[kytDraftSubtitles.length - 1].end || 0) : 0;
  kytDraftSubtitles.push({ start: lastEnd, end: lastEnd + 3, ko: "", id: "", source: "MANUAL" });
  renderDraftSubtitlesEditor();
}

function removeDraftSubtitleRow(idx) {
  kytDraftSubtitles.splice(idx, 1);
  renderDraftSubtitlesEditor();
}

function renderDraftSubtitlesEditor() {
  const box = document.getElementById("kyt-draft-subtitles-list");
  if (!box) return;

  if (!kytDraftSubtitles.length) {
    box.innerHTML = `<p style="color:#64748b; text-align:center; font-size:13px; padding:16px;">자막 데이터가 비어 있습니다.</p>`;
    return;
  }

  box.innerHTML = kytDraftSubtitles.map((row, idx) => `
    <div style="display:grid; grid-template-columns:70px 70px 1.5fr 1.5fr 36px; gap:6px; align-items:center; margin-bottom:6px; padding-bottom:6px; border-bottom:1px solid #f1f5f9;">
      <input type="number" step="0.1" value="${row.start}" onchange="kytDraftSubtitles[${idx}].start=parseFloat(this.value)||0" placeholder="시작(초)" />
      <input type="number" step="0.1" value="${row.end}" onchange="kytDraftSubtitles[${idx}].end=parseFloat(this.value)||0" placeholder="종료(초)" />
      <input type="text" value="${(row.ko || "").replace(/"/g, "&quot;")}" onchange="kytDraftSubtitles[${idx}].ko=this.value" placeholder="한국어 자막" />
      <input type="text" value="${(row.id || "").replace(/"/g, "&quot;")}" onchange="kytDraftSubtitles[${idx}].id=this.value" placeholder="인도네시아어 번역" />
      <button type="button" style="background:#dc2626; padding:6px 0;" onclick="removeDraftSubtitleRow(${idx})">✕</button>
    </div>
  `).join("");
}

async function saveNewYoutubeVideo() {
  clearMsg();
  const youtube_url = document.getElementById("kyt-new-url")?.value.trim();
  const title = document.getElementById("kyt-new-title")?.value.trim();
  const level = document.getElementById("kyt-new-level")?.value || "초급";
  const tags = (document.getElementById("kyt-new-tags")?.value || "").split(",").map(t => t.trim()).filter(Boolean);
  const description = document.getElementById("kyt-new-desc")?.value.trim() || "";

  if (!youtube_url || !title) {
    return showMsg("유튜브 링크와 제목을 모두 입력해 주세요.", true);
  }

  const res = await fetch("/api/v1/modules/korean_youtube/videos", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      youtube_url,
      title,
      level,
      tags,
      description,
      subtitle_source: kytDraftSource,
      subtitles: kytDraftSubtitles,
    }),
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "저장 실패", true);

  kytDraftSubtitles = [];
  renderDraftSubtitlesEditor();
  document.getElementById("kyt-new-url").value = "";
  document.getElementById("kyt-new-title").value = "";
  document.getElementById("kyt-new-desc").value = "";
  showMsg("유튜브 학습 영상과 타임스탬프 자막이 저장되었습니다!");
  loadAdminKytVideos();
}

async function loadAdminKytVideos() {
  const res = await fetch("/api/v1/modules/korean_youtube/videos", { headers: getAuthHeaders(false) });
  const container = document.getElementById("kyt-admin-video-list");
  if (!res.ok || !container) return;

  const list = await res.json();
  container.innerHTML = list.map(v => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
      <div>
        <span class="pos-badge">${v.level}</span>
        <strong style="margin-left:6px;">${v.title}</strong>
        <span style="font-size:12px; color:#64748b; margin-left:6px;">(${(v.subtitles || []).length}문장 · ${v.subtitle_source})</span>
      </div>
      <button type="button" style="background:#dc2626; padding:6px 10px; font-size:12px;" onclick="deleteKytVideo('${v.id}')">삭제</button>
    </div>
  `).join("");
}

async function deleteKytVideo(itemId) {
  if (!confirm("이 유튜브 학습 자료를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_youtube/videos/${itemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("삭제 실패", true);
  showMsg("삭제되었습니다.");
  loadAdminKytVideos();
}