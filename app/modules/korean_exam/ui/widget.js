/* =========================================================
   korean_exam/ui/widget.js — 공통 상태, 권한 판별, 오디오/TTS 및 모듈 로더
   ========================================================= */

var kexamGroups = [];
var kexamBankQuestions = [];
var editingGroupId = null;
var editingQuestionId = null;
var currentBankPage = 1;

var editingPaperId = null;
var paperPickerQuestions = [];
var paperPickerPage = 1;
var paperSelectedItems = [];
var managedPapersCache = [];

var currentExamPaper = null;
var examUserAnswers = {};
var examTimerInterval = null;
var examTotalSeconds = 600;
var examRemainingSeconds = 600;
var lastExamGradeResult = null;

var currentAudioPlayer = null;
var audioQueueCancelled = false;

var GUEST_PENDING_RESULT_KEY = "kexam_guest_pending_result";
var kexamSubScriptsLoaded = false;

function isExamStaffUser() {
  if (!currentUser) return false;
  const userGrade = String(currentUser.grade || currentUser.role || "").trim().toUpperCase();
  return userGrade === "ADMIN" || userGrade === "TEACHER";
}

async function ensureKoreanExamSubScripts() {
  if (kexamSubScriptsLoaded) return;
  const subFiles = ["exam_take.js", "exam_history.js", "exam_admin.js"];
  const v = Date.now();

  for (const file of subFiles) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `/static/modules/korean_exam/${file}?v=${v}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`${file} 로드 실패`));
      document.body.appendChild(script);
    });
  }
  kexamSubScriptsLoaded = true;
}

async function initKoreanExamModule() {
  stopAllExamAudio();

  // 1. 분할된 하위 스크립트(exam_take.js, exam_history.js, exam_admin.js)를 먼저 로드
  try {
    await ensureKoreanExamSubScripts();
  } catch (err) {
    showMsg(`시험 모듈 스크립트 로드 오류: ${err.message}`, true);
    return;
  }

  // 2. 하위 스크립트 로드 완료 후 타이머 초기화 호출
  if (typeof stopExamTimer === "function") {
    stopExamTimer();
  }

  // 3. 전역 currentUser가 아직 비어 있고 토큰이 있다면 직접 내 정보 조회
  const token = localStorage.getItem("access_token");
  if (!currentUser && token) {
    try {
      const meRes = await fetch("/api/v1/auth/me", { headers: getAuthHeaders(false) });
      if (meRes.ok) {
        currentUser = await meRes.json();
      }
    } catch (e) {
      console.error("사용자 권한 확인 실패:", e);
    }
  }

  const isStaff = isExamStaffUser();
  document.querySelectorAll(".kexam-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  const guestBanner = document.getElementById("ke-guest-notice-banner");
  if (guestBanner) {
    guestBanner.classList.toggle("hidden", Boolean(currentUser));
  }

  if (currentUser && sessionStorage.getItem(GUEST_PENDING_RESULT_KEY) && typeof claimPendingGuestResult === "function") {
    await claimPendingGuestResult();
  }

  if (typeof renderChoicesEditor === "function") {
    renderChoicesEditor();
  }
  switchKexamTab("take");

  const urlParams = new URLSearchParams(window.location.search);
  const sharedPaperId = urlParams.get("paper_id");
  if (sharedPaperId && typeof loadSharedPaperLanding === "function") {
    await loadSharedPaperLanding(sharedPaperId);
  }
}

function switchKexamTab(tabName) {
  if (typeof clearMsg === "function") clearMsg();
  stopAllExamAudio();
  ["take", "history", "papers", "questions", "groups"].forEach(t => {
    const sec = document.getElementById(`kexam-sec-${t}`);
    const btn = document.getElementById(`kexam-tab-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) btn.classList.toggle("active", t === tabName);
  });

  if (tabName === "take" && typeof loadPublishedExamPapersForStudent === "function") {
    loadPublishedExamPapersForStudent();
  }
  if (tabName === "history" && typeof loadMyExamHistory === "function") {
    loadMyExamHistory();
  }
  if (tabName === "papers" && typeof loadPaperPickerQuestions === "function") {
    loadPaperPickerQuestions(1);
    renderPaperSelectedItems();
    loadManagedExamPapers();
  }
  if (tabName === "questions" && typeof loadBankQuestionsList === "function") {
    loadExamGroupsForSelect();
    loadBankQuestionsList(1);
  }
  if (tabName === "groups" && typeof loadExamGroupsList === "function") {
    loadExamGroupsList();
  }
}

function getAttemptModeLabel(mode) {
  if (mode === "RETRY_WRONG") return "틀린 문항 다시보기";
  if (mode === "RETRY_ALL") return "전체 다시보기";
  return "본시험";
}

function formatMMSS(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* =========================================================
   오디오 파일 + TTS 읽어주기 순차 재생 엔진
   ========================================================= */

function stopAllExamAudio() {
  audioQueueCancelled = true;
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer.currentTime = 0;
    currentAudioPlayer = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function playSingleMediaOrTTS(audioUrl, ttsText) {
  return new Promise((resolve) => {
    if (audioQueueCancelled) return resolve();

    if (audioUrl && audioUrl.trim()) {
      const audio = new Audio(audioUrl.trim());
      currentAudioPlayer = audio;
      audio.onended = () => {
        currentAudioPlayer = null;
        setTimeout(resolve, 450);
      };
      audio.onerror = () => {
        currentAudioPlayer = null;
        resolve();
      };
      audio.play().catch(() => resolve());
    } else if (ttsText && ttsText.trim() && "speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(ttsText.trim());
      utter.lang = "ko-KR";
      utter.rate = 0.95;
      utter.onend = () => setTimeout(resolve, 450);
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } else {
      resolve();
    }
  });
}

async function playQuestionSequence(sectionIdx, qIdx) {
  stopAllExamAudio();
  audioQueueCancelled = false;

  if (!currentExamPaper) return;
  const section = currentExamPaper.sections[sectionIdx];
  if (!section) return;
  const q = section.questions[qIdx];
  if (!q) return;

  const queue = [];
  if (section.group_info && (section.group_info.audio_url || section.group_info.tts_text)) {
    queue.push({ audio: section.group_info.audio_url, tts: section.group_info.tts_text });
  }
  if (q.audio_url || q.tts_text) {
    queue.push({ audio: q.audio_url, tts: q.tts_text });
  }
  (q.choices || []).forEach((ch, idx) => {
    if (ch.audio_url || ch.tts_text) {
      const prefixTts = ch.tts_text ? `${idx + 1}번. ${ch.tts_text}` : "";
      queue.push({ audio: ch.audio_url, tts: prefixTts });
    }
  });

  for (const item of queue) {
    if (audioQueueCancelled) break;
    await playSingleMediaOrTTS(item.audio, item.tts);
  }
}