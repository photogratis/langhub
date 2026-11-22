var kexamGroups = [];
var kexamBankQuestions = [];
var editingGroupId = null;
var editingQuestionId = null;
var currentBankPage = 1;

// 시험지 제작(Paper Builder) 상태 변수
var editingPaperId = null;
var paperPickerQuestions = [];
var paperPickerPage = 1;
var paperSelectedItems = []; // [{ question_id, raw_question, points }]
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

function isExamStaffUser() {
  if (!currentUser) return false;
  const userGrade = String(currentUser.grade || currentUser.role || "").toUpperCase();
  return ["ADMIN", "GURU", "TEACHER", "STAFF", "관리자", "선생님"].includes(userGrade);
}

async function initKoreanExamModule() {
  stopAllExamAudio();
  stopExamTimer();

  const isStaff = isExamStaffUser();
  document.querySelectorAll(".kexam-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  // 비회원 안내 배너 토글
  const guestBanner = document.getElementById("ke-guest-notice-banner");
  if (guestBanner) {
    guestBanner.classList.toggle("hidden", Boolean(currentUser));
  }

  // 비회원이 시험 직후 로그인/회원가입을 마쳤다면 임시 저장된 시험 결과를 계정에 자동 이관
  if (currentUser && sessionStorage.getItem(GUEST_PENDING_RESULT_KEY)) {
    await claimPendingGuestResult();
  }

  renderChoicesEditor();
  switchKexamTab("take");

  // 공유 링크(?module=korean_exam&paper_id=...)로 접속한 경우 해당 시험지 전용 시작 카드 표시
  const urlParams = new URLSearchParams(window.location.search);
  const sharedPaperId = urlParams.get("paper_id");
  if (sharedPaperId) {
    await loadSharedPaperLanding(sharedPaperId);
  }
}

function switchKexamTab(tabName) {
  clearMsg();
  stopAllExamAudio();
  ["take", "history", "papers", "questions", "groups"].forEach(t => {
    const sec = document.getElementById(`kexam-sec-${t}`);
    const btn = document.getElementById(`kexam-tab-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) btn.classList.toggle("active", t === tabName);
  });

  if (tabName === "take") {
    loadPublishedExamPapersForStudent();
  }
  if (tabName === "history") loadMyExamHistory();
  if (tabName === "papers") {
    loadPaperPickerQuestions(1);
    renderPaperSelectedItems();
    loadManagedExamPapers();
  }
  if (tabName === "questions") {
    loadExamGroupsForSelect();
    loadBankQuestionsList(1);
  }
  if (tabName === "groups") loadExamGroupsList();
}

function switchExamSetupMode(mode) {
  const isPaper = mode === "PAPER";
  document.getElementById("ke-mode-btn-paper").className = isPaper ? "" : "secondary";
  document.getElementById("ke-mode-btn-random").className = !isPaper ? "" : "secondary";
  document.getElementById("kexam-paper-select-box").classList.toggle("hidden", !isPaper);
  document.getElementById("kexam-random-setup-box").classList.toggle("hidden", isPaper);
}

function getAttemptModeLabel(mode) {
  if (mode === "RETRY_WRONG") return "틀린 문항 다시보기";
  if (mode === "RETRY_ALL") return "전체 다시보기";
  return "본시험";
}

/* =========================================================
   [공유 링크 · QR코드 · 비회원 결과 이관 저장]
   ========================================================= */

async function loadSharedPaperLanding(paperId) {
  const res = await fetch(`/api/v1/modules/korean_exam/papers/${paperId}/info`);
  if (!res.ok) return showMsg("유효하지 않거나 비공개된 시험 링크입니다.", true);

  const info = await res.json();
  const landingEl = document.getElementById("ke-shared-paper-landing");
  if (!landingEl) return;

  landingEl.classList.remove("hidden");
  landingEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
      <div>
        <span class="tag" style="background:#2563eb; color:#fff;">공유된 공식 시험지</span>
        <span class="pos-badge">${info.level} · ${info.category}</span>
        <h3 style="margin:8px 0 4px 0; color:#0f172a;">${info.title}</h3>
        ${info.description ? `<p style="margin:0 0 8px 0; font-size:13.5px; color:#334155;">${info.description}</p>` : ""}
        <div style="font-size:13px; color:#475569;">
          문항 수: <b>${info.question_count}문항</b> · 총 배점: <b>${info.total_points}점</b> · 제한 시간: <b>${Math.round(info.time_limit_seconds / 60)}분</b> · 출제자: ${info.creator_name}
        </div>
      </div>
      <button type="button" style="background:#16a34a; padding:12px 20px; font-size:14px;" onclick="confirmAndStartSharedPaper('${info.id}')">
        ▶ 지금 바로 시험 시작하기
      </button>
    </div>
    ${!currentUser ? `
      <div style="margin-top:12px; padding:10px 12px; background:#fffbeb; border:1px solid #fcd34d; border-radius:6px; font-size:12.5px; color:#92400e;">
        ※ 비회원 상태로 응시하면 채점 결과는 확인할 수 있으나 <b>기록이 저장되지 않습니다.</b> 오답 반복 재시험을 원하시면 먼저 로그인해 주세요.
      </div>
    ` : ""}
  `;
}

function confirmAndStartSharedPaper(paperId) {
  if (!currentUser) {
    const ok = confirm(
      "현재 비회원 상태입니다.\n" +
      "비회원은 시험을 봐도 시험 결과가 저장되지 않으며, 틀린 문제를 반복해서 다시 시험 볼 수 없습니다.\n\n" +
      "[확인]을 누르면 비회원으로 바로 시험을 시작하고,\n" +
      "[취소]를 누르면 먼저 로그인/회원가입을 진행할 수 있습니다."
    );
    if (!ok) {
      openAuthModalForExam();
      return;
    }
  }
  const landingEl = document.getElementById("ke-shared-paper-landing");
  if (landingEl) landingEl.classList.add("hidden");
  startPublishedPaper(paperId, true);
}

function openExamShareModal(paperId, paperTitle) {
  const shareUrl = `${window.location.origin}/?module=korean_exam&paper_id=${encodeURIComponent(paperId)}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(shareUrl)}`;

  document.getElementById("ke-share-modal-title").textContent = `[${paperTitle}] 배포 링크 & QR코드`;
  document.getElementById("ke-share-url-input").value = shareUrl;
  document.getElementById("ke-share-qr-img").src = qrApiUrl;
  document.getElementById("ke-share-qr-download").href = qrApiUrl;
  document.getElementById("ke-share-modal").classList.remove("hidden");
}

function closeExamShareModal() {
  document.getElementById("ke-share-modal").classList.add("hidden");
}

function copyExamShareUrl() {
  const input = document.getElementById("ke-share-url-input");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showMsg("시험 응시 링크가 클립보드에 복사되었습니다!");
  });
}

function openAuthModalForExam() {
  if (typeof showAuthSection === "function") {
    showAuthSection();
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
    showMsg("상단의 로그인 / 회원가입 메뉴를 이용해 로그인하시면 시험 기록과 오답 반복 학습이 자동으로 저장됩니다.");
  }
}

function handleGuestResultConversion(gradeData) {
  sessionStorage.setItem(GUEST_PENDING_RESULT_KEY, JSON.stringify(gradeData));
  const actionsEl = document.getElementById("ke-result-actions");
  if (!actionsEl) return;

  actionsEl.innerHTML = `
    <div style="width:100%; background:#fffbeb; border:2px solid #f59e0b; border-radius:8px; padding:14px; text-align:left;">
      <div style="font-weight:800; color:#92400e; font-size:14px; margin-bottom:4px;">
        💡 방금 본 시험 결과를 저장하고 틀린 문제(${gradeData.wrong_count}문항)를 반복 학습하시겠습니까?
      </div>
      <div style="font-size:13px; color:#78350f; margin-bottom:10px;">
        지금 무료 회원가입 및 로그인을 하시면 <b>방금 응시한 시험 성적과 정오답 내역이 자동으로 계정에 저장</b>되며, 틀린 문제만 골라 2회차·3회차 반복 재시험을 볼 수 있습니다.
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" style="background:#d97706; padding:9px 14px;" onclick="openAuthModalForExam()">
          회원가입 / 로그인하고 방금 시험 결과 저장하기
        </button>
        <button type="button" class="secondary" style="padding:9px 14px;" onclick="resetKexamToSetup()">
          저장하지 않고 다른 시험 보기
        </button>
      </div>
    </div>
  `;
}

async function claimPendingGuestResult() {
  const raw = sessionStorage.getItem(GUEST_PENDING_RESULT_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const res = await fetch("/api/v1/modules/korean_exam/claim-guest-attempt", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        exam_title: parsed.exam_title,
        elapsed_seconds: parsed.elapsed_seconds || 0,
        time_limit_seconds: parsed.time_limit_seconds || 600,
        total_questions: parsed.total_questions,
        correct_count: parsed.correct_count,
        wrong_count: parsed.wrong_count,
        earned_points: parsed.earned_points,
        total_points: parsed.total_points,
        score: parsed.score,
        detail_results: parsed.detail_results || []
      })
    });
    if (res.ok) {
      const claimData = await res.json();
      sessionStorage.removeItem(GUEST_PENDING_RESULT_KEY);
      showMsg(claimData.message);
    }
  } catch (e) {
    console.error("게스트 시험 기록 이관 오류:", e);
  }
}

/* =========================================================
   [오디오 파일 + TTS 읽어주기 순차 재생 엔진]
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

/* =========================================================
   [1] 시험 응시 (출제 시험지 선택 + 랜덤 출제 + 다시보기)
   ========================================================= */

async function loadPublishedExamPapersForStudent() {
  const container = document.getElementById("ke-published-papers-list");
  if (!container) return;

  const res = await fetch("/api/v1/modules/korean_exam/papers", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#64748b;">배포된 시험지를 불러올 수 없습니다.</p>`;
    return;
  }
  const papers = await res.json();
  if (!papers.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:18px; color:#64748b; font-size:13px;">
        현재 배포된 공식 시험지가 없습니다. 우측 상단의 <b>[조건별 랜덤 출제]</b>를 이용해 바로 시험을 보실 수 있습니다.
      </div>
    `;
    return;
  }

  container.innerHTML = papers.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <div>
          <span class="pos-badge">${p.level} · ${p.category}</span>
          <strong style="font-size:16px; color:#0f172a; margin-left:6px;">${p.title}</strong>
        </div>
        ${p.description ? `<div style="font-size:13px; color:#475569; margin-top:4px;">${p.description}</div>` : ""}
        <div style="font-size:12px; color:#64748b; margin-top:4px;">
          문항 수: <b>${(p.items || []).length}문항</b> · 총 배점: <b>${p.total_points}점</b> · 제한 시간: <b>${Math.round((p.time_limit_seconds || 600) / 60)}분</b> · 출제자: ${p.creator_name || "선생님"}
        </div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <button type="button" class="secondary" style="padding:8px 12px; font-size:12px;" onclick="openExamShareModal('${p.id}', ${JSON.stringify(p.title)})">🔗 링크·QR</button>
        <button type="button" style="background:#2563eb; padding:9px 16px;" onclick="startPublishedPaper('${p.id}')">이 시험지 응시하기</button>
      </div>
    </div>
  `).join("");
}

async function startPublishedPaper(paperId, skipGuestConfirm = false) {
  clearMsg();
  if (!currentUser && !skipGuestConfirm) {
    const proceed = confirm(
      "현재 비회원 상태입니다.\n" +
      "비회원은 시험을 봐도 시험 결과가 기록되지 않으며, 틀린 문제를 반복해서 다시 시험 볼 수 없습니다.\n\n" +
      "계속 비회원으로 시험을 시작하시겠습니까?"
    );
    if (!proceed) {
      openAuthModalForExam();
      return;
    }
  }

  const res = await fetch(`/api/v1/modules/korean_exam/papers/${paperId}/start`, {
    method: "POST",
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "시험지 로드 실패", true);
  _launchLoadedExamPaper(data);
}

function stopExamTimer() {
  if (examTimerInterval) {
    clearInterval(examTimerInterval);
    examTimerInterval = null;
  }
}

function formatMMSS(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resetKexamToSetup() {
  stopAllExamAudio();
  stopExamTimer();
  currentExamPaper = null;
  examUserAnswers = {};
  document.getElementById("kexam-setup-box").classList.remove("hidden");
  document.getElementById("kexam-play-box").classList.add("hidden");
  document.getElementById("kexam-result-box").classList.add("hidden");
  loadPublishedExamPapersForStudent();
}

function _launchLoadedExamPaper(data) {
  currentExamPaper = data;
  examUserAnswers = {};
  examTotalSeconds = data.time_limit_seconds;
  examRemainingSeconds = data.time_limit_seconds;

  data.sections.forEach(sec => {
    sec.questions.forEach(q => {
      examUserAnswers[q.question_id] = {
        question_id: q.question_id,
        display_no: q.display_no,
        points: q.points,
        selected_choice_id: null,
        short_answer_text: ""
      };
    });
  });

  const roundNo = data.next_round_no || 1;
  const modeLabel = getAttemptModeLabel(data.attempt_mode || "NEW");
  const badgeEl = document.getElementById("ke-round-badge");
  badgeEl.textContent = `${roundNo}회차 · ${modeLabel}`;
  badgeEl.style.background = data.attempt_mode === "RETRY_WRONG" ? "#d97706" : (data.attempt_mode === "RETRY_ALL" ? "#7c3aed" : "#2563eb");

  document.getElementById("ke-play-title").textContent = data.exam_title;
  document.getElementById("kexam-setup-box").classList.add("hidden");
  document.getElementById("kexam-result-box").classList.add("hidden");
  document.getElementById("kexam-play-box").classList.remove("hidden");

  renderExamPaper();
  updateExamProgress();
  startExamCountdown();

  const autoPlayBox = document.getElementById("ke-auto-play");
  if (autoPlayBox && autoPlayBox.checked && data.sections.length > 0) {
    setTimeout(() => playQuestionSequence(0, 0), 400);
  }
}

async function startKoreanExam(e) {
  e.preventDefault();
  clearMsg();

  if (!currentUser) {
    const proceed = confirm(
      "현재 비회원 상태입니다.\n" +
      "비회원은 시험을 봐도 시험 결과가 기록되지 않으며, 틀린 문제를 반복해서 다시 시험 볼 수 없습니다.\n\n" +
      "계속 비회원으로 시험을 시작하시겠습니까?"
    );
    if (!proceed) {
      openAuthModalForExam();
      return;
    }
  }

  const body = {
    exam_title: document.getElementById("ke-title").value.trim(),
    level: document.getElementById("ke-level").value || null,
    category: document.getElementById("ke-category").value || null,
    question_type: document.getElementById("ke-qtype").value || null,
    max_questions: parseInt(document.getElementById("ke-max-q").value, 10) || 10,
    time_limit_seconds: (parseInt(document.getElementById("ke-mins").value, 10) || 10) * 60,
    tag: document.getElementById("ke-tag").value.trim() || null
  };

  const res = await fetch("/api/v1/modules/korean_exam/generate", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "시험지 생성 실패", true);

  _launchLoadedExamPaper(data);
}

async function retryExamFromAttempt(attemptId, retryMode) {
  clearMsg();
  stopAllExamAudio();

  const res = await fetch("/api/v1/modules/korean_exam/retry", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      attempt_id: attemptId,
      retry_mode: retryMode
    })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "재시험 생성 실패", true);

  switchKexamTab("take");
  _launchLoadedExamPaper(data);
}

function renderExamPaper() {
  const container = document.getElementById("ke-sections-container");
  container.innerHTML = currentExamPaper.sections.map((sec, sIdx) => {
    const grp = sec.group_info;
    const groupHeaderHtml = grp ? `
      <div style="background:#f5f3ff; border:2px solid #c4b5fd; border-radius:8px; padding:14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <strong style="color:#5b21b6; font-size:15px;">[${sec.range_label}] ${grp.instruction}</strong>
          ${(grp.audio_url || grp.tts_text) ? `
            <button type="button" style="background:#7c3aed; padding:5px 10px; font-size:12px;" onclick="playSingleMediaOrTTS('${grp.audio_url || ""}', ${JSON.stringify(grp.tts_text || "")})">
              ▶ 공통 지문 듣기
            </button>` : ""}
        </div>
        ${grp.passage_text ? `<div style="margin-top:8px; padding:10px; background:#fff; border-radius:6px; font-size:14px; line-height:1.6; white-space:pre-line;">${grp.passage_text}</div>` : ""}
        ${grp.image_url ? `<div style="margin-top:8px;"><img src="${grp.image_url}" style="max-width:100%; max-height:260px; border-radius:6px; border:1px solid #ddd6fe;" /></div>` : ""}
      </div>
    ` : "";

    const questionsHtml = sec.questions.map((q, qIdx) => {
      const hasAnyAudio = Boolean(
        (grp && (grp.audio_url || grp.tts_text)) ||
        q.audio_url || q.tts_text ||
        (q.choices || []).some(c => c.audio_url || c.tts_text)
      );

      return `
        <div class="word-card" style="background:#fff; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
            <div>
              <span class="tag" style="background:#1e293b; color:#fff;">${q.display_no}번</span>
              <span class="pos-badge">${q.level} · ${q.category}</span>
              <span class="tag" style="background:#fef3c7; color:#92400e; margin-left:4px;">배점 ${q.points}점</span>
            </div>
            ${hasAnyAudio ? `
              <button type="button" style="background:#0284c7; padding:5px 10px; font-size:12px;" onclick="playQuestionSequence(${sIdx}, ${qIdx})">
                ▶ 문항·보기 순차 듣기
              </button>` : ""}
          </div>

          <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:8px;">${q.prompt_text}</div>

          ${q.passage_text ? `<div style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:14px; margin-bottom:10px; white-space:pre-line;">${q.passage_text}</div>` : ""}
          ${q.image_url ? `<div style="margin-bottom:10px;"><img src="${q.image_url}" style="max-width:100%; max-height:240px; border-radius:6px; border:1px solid #cbd5e1;" /></div>` : ""}

          ${q.question_type === "MCQ" ? `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              ${(q.choices || []).map((ch, cIdx) => `
                <div
                  id="ke-choice-${q.question_id}-${ch.id}"
                  onclick="selectExamChoice('${q.question_id}', '${ch.id}')"
                  style="border:1px solid #cbd5e1; background:#f8fafc; border-radius:6px; padding:10px; cursor:pointer; transition:0.15s;"
                >
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    <span style="font-weight:700; font-size:14px;">${cIdx + 1}. ${ch.text || ""}</span>
                    ${(ch.audio_url || ch.tts_text) ? `
                      <button type="button" style="padding:3px 7px; font-size:11px; background:#475569;" onclick="event.stopPropagation(); stopAllExamAudio(); audioQueueCancelled=false; playSingleMediaOrTTS('${ch.audio_url || ""}', ${JSON.stringify(ch.tts_text || "")})">
                        🔊 듣기
                      </button>` : ""}
                  </div>
                  ${ch.image_url ? `<img src="${ch.image_url}" style="max-width:100%; max-height:130px; margin-top:6px; border-radius:4px;" />` : ""}
                </div>
              `).join("")}
            </div>
          ` : `
            <div>
              <label>주관식 답안 입력</label>
              <input
                type="text"
                placeholder="정답을 한국어로 입력하세요..."
                oninput="updateExamShortAnswer('${q.question_id}', this.value)"
              />
            </div>
          `}
        </div>
      `;
    }).join("");

    return `<div style="margin-bottom:20px;">${groupHeaderHtml}${questionsHtml}</div>`;
  }).join("");
}

function selectExamChoice(questionId, choiceId) {
  if (examUserAnswers[questionId]) {
    examUserAnswers[questionId].selected_choice_id = choiceId;
  }

  currentExamPaper.sections.forEach(sec => {
    sec.questions.forEach(q => {
      if (q.question_id === questionId) {
        (q.choices || []).forEach(ch => {
          const box = document.getElementById(`ke-choice-${questionId}-${ch.id}`);
          if (!box) return;
          if (ch.id === choiceId) {
            box.style.background = "#dbeafe";
            box.style.borderColor = "#2563eb";