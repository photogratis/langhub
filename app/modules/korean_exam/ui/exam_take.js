/* =========================================================
   korean_exam/ui/exam_take.js — 시험 응시, 공유 링크·QR코드, 비회원 결과 저장
   ========================================================= */

var isClaimingGuestResult = false;

function switchExamSetupMode(mode) {
  const isPaper = mode === "PAPER";
  document.getElementById("ke-mode-btn-paper").className = isPaper ? "" : "secondary";
  document.getElementById("ke-mode-btn-random").className = !isPaper ? "" : "secondary";
  document.getElementById("kexam-paper-select-box").classList.toggle("hidden", !isPaper);
  document.getElementById("kexam-random-setup-box").classList.toggle("hidden", isPaper);
}

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
  const modal = document.getElementById("ke-share-modal");
  if (!modal) {
    return showMsg("공유 모달 UI를 찾을 수 없습니다. 브라우저를 새로고침(Ctrl+Shift+R)해 주세요.", true);
  }

  const shareUrl = `${window.location.origin}/?module=korean_exam&paper_id=${encodeURIComponent(paperId)}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(shareUrl)}`;

  document.getElementById("ke-share-modal-title").textContent = `[${paperTitle}] 배포 링크 & QR코드`;
  document.getElementById("ke-share-url-input").value = shareUrl;
  document.getElementById("ke-share-qr-img").src = qrApiUrl;
  document.getElementById("ke-share-qr-download").href = qrApiUrl;

  modal.classList.remove("hidden");
  modal.style.display = "flex";
}

function closeExamShareModal() {
  const modal = document.getElementById("ke-share-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.style.display = "none";
}

function copyExamShareUrl() {
  const input = document.getElementById("ke-share-url-input");
  if (!input) return;
  input.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(() => {
      showMsg("시험 응시 링크가 클립보드에 복사되었습니다!");
    }).catch(() => {
      document.execCommand("copy");
      showMsg("시험 응시 링크가 복사되었습니다!");
    });
  } else {
    document.execCommand("copy");
    showMsg("시험 응시 링크가 복사되었습니다!");
  }
}

function openAuthModalForExam() {
  if (typeof openBaseView === "function") {
    openBaseView("auth");
  } else if (typeof showShellView === "function") {
    showShellView("auth");
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

// 로그인 직후 임시 보관된 비회원 시험 결과를 DB로 1회만 안전하게 이관
async function claimPendingGuestResult() {
  if (isClaimingGuestResult) return;

  const raw = sessionStorage.getItem(GUEST_PENDING_RESULT_KEY);
  if (!raw) return;

  // 중복 호출 방지를 위해 네트워크 요청 전에 즉시 키 제거 및 잠금 설정
  sessionStorage.removeItem(GUEST_PENDING_RESULT_KEY);
  isClaimingGuestResult = true;

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
      showMsg(claimData.message);
    } else {
      // 서버 오류 시에만 복구
      sessionStorage.setItem(GUEST_PENDING_RESULT_KEY, raw);
    }
  } catch (e) {
    sessionStorage.setItem(GUEST_PENDING_RESULT_KEY, raw);
    console.error("게스트 시험 기록 이관 오류:", e);
  } finally {
    isClaimingGuestResult = false;
  }
}

async function loadPublishedExamPapersForStudent() {
  const container = document.getElementById("ke-published-papers-list");
  if (!container) return;

  container.innerHTML = `<p style="color:#64748b; font-size:13px; text-align:center; padding:12px;">시험지 목록을 불러오는 중...</p>`;

  const res = await fetch("/api/v1/modules/korean_exam/papers", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:13px;">배포된 시험지를 불러올 수 없습니다. (HTTP ${res.status})</p>`;
    return;
  }
  const papers = await res.json();
  if (!Array.isArray(papers) || !papers.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:18px; color:#64748b; font-size:13px;">
        현재 배포된 공식 시험지가 없습니다. 상단의 <b>[조건별 랜덤 출제]</b>를 이용해 바로 시험을 보실 수 있습니다.
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
        <button type="button" class="secondary" style="padding:8px 12px; font-size:12px;" onclick='openExamShareModal("${p.id}", ${JSON.stringify(p.title)})'>🔗 링크·QR</button>
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

function _normalizeExamTitleCompare(str) {
  return String(str || "")
    .replace(/\s+/g, "")
    .replace(/[.?!~]+$/g, "")
    .trim();
}

function renderExamPaper() {
  const container = document.getElementById("ke-sections-container");
  container.innerHTML = currentExamPaper.sections
    .map((sec, sIdx) => {
      const isGrouped = sec.section_type === "GROUP" && Boolean(sec.group_info);
      const grp = isGrouped ? sec.group_info : null;

      const groupHeaderHtml = grp
        ? `
          <div style="background:#f5f3ff; border:2px solid #c4b5fd; border-radius:8px; padding:14px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <strong style="color:#5b21b6; font-size:15px;">[${sec.range_label}] ${grp.instruction}</strong>
              ${
                grp.audio_url || grp.tts_text
                  ? `<button type="button" style="background:#7c3aed; padding:5px 10px; font-size:12px;" onclick='playSingleMediaOrTTS("${grp.audio_url || ""}", ${JSON.stringify(grp.tts_text || "")})'>
                      ▶ 공통 지문 듣기
                    </button>`
                  : ""
              }
            </div>
            ${
              grp.passage_text
                ? `<div style="margin-top:8px; padding:10px; background:#fff; border-radius:6px; font-size:14px; line-height:1.6; white-space:pre-line;">${grp.passage_text}</div>`
                : ""
            }
            ${
              grp.image_url
                ? `<div style="margin-top:8px;"><img src="${grp.image_url}" style="max-width:100%; max-height:260px; border-radius:6px; border:1px solid #ddd6fe;" /></div>`
                : ""
            }
          </div>
        `
        : "";

      const questionsHtml = sec.questions
        .map((q, qIdx) => {
          const hasAnyAudio = Boolean(
            (grp && (grp.audio_url || grp.tts_text)) ||
              q.audio_url ||
              q.tts_text ||
              (q.choices || []).some(c => c.audio_url || c.tts_text)
          );

          // 그룹이 함께 출력될 때 그룹 제목 또는 지시문과 문제 제목(발문)이 일치하면 문제 제목 생략
          const normPrompt = _normalizeExamTitleCompare(q.prompt_text);
          const isSameAsGroup =
            grp &&
            normPrompt &&
            (normPrompt === _normalizeExamTitleCompare(grp.title) ||
              normPrompt === _normalizeExamTitleCompare(grp.instruction));

          const showPromptTitle = !isSameAsGroup && Boolean((q.prompt_text || "").trim());

          return `
            <div class="word-card" style="background:#fff; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                <div>
                  <span class="tag" style="background:#1e293b; color:#fff;">${q.display_no}번</span>
                  <span class="pos-badge">${q.level} · ${q.category}</span>
                  <span class="tag" style="background:#fef3c7; color:#92400e; margin-left:4px;">배점 ${q.points}점</span>
                </div>
                ${
                  hasAnyAudio
                    ? `<button type="button" style="background:#0284c7; padding:5px 10px; font-size:12px;" onclick="playQuestionSequence(${sIdx}, ${qIdx})">
                        ▶ 문항·보기 순차 듣기
                      </button>`
                    : ""
                }
              </div>

              ${
                showPromptTitle
                  ? `<div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:8px;">${q.prompt_text}</div>`
                  : ""
              }

              ${
                q.passage_text
                  ? `<div style="padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:14px; margin-bottom:10px; white-space:pre-line;">${q.passage_text}</div>`
                  : ""
              }
              ${
                q.image_url
                  ? `<div style="margin-bottom:10px;"><img src="${q.image_url}" style="max-width:100%; max-height:240px; border-radius:6px; border:1px solid #cbd5e1;" /></div>`
                  : ""
              }

              ${
                q.question_type === "MCQ"
                  ? `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                      ${(q.choices || [])
                        .map(
                          (ch, cIdx) => `
                          <div
                            id="ke-choice-${q.question_id}-${ch.id}"
                            onclick="selectExamChoice('${q.question_id}', '${ch.id}')"
                            style="border:1px solid #cbd5e1; background:#f8fafc; border-radius:6px; padding:10px; cursor:pointer; transition:0.15s;"
                          >
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                              <span style="font-weight:700; font-size:14px;">${cIdx + 1}. ${ch.text || ""}</span>
                              ${
                                ch.audio_url || ch.tts_text
                                  ? `<button type="button" style="padding:3px 7px; font-size:11px; background:#475569;" onclick='event.stopPropagation(); stopAllExamAudio(); audioQueueCancelled=false; playSingleMediaOrTTS("${ch.audio_url || ""}", ${JSON.stringify(ch.tts_text || "")})'>
                                      🔊 듣기
                                    </button>`
                                  : ""
                              }
                            </div>
                            ${
                              ch.image_url
                                ? `<img src="${ch.image_url}" style="max-width:100%; max-height:130px; margin-top:6px; border-radius:4px;" />`
                                : ""
                            }
                          </div>
                        `
                        )
                        .join("")}
                    </div>
                  `
                  : `
                    <div>
                      <label>주관식 답안 입력</label>
                      <input
                        type="text"
                        placeholder="정답을 한국어로 입력하세요..."
                        oninput="updateExamShortAnswer('${q.question_id}', this.value)"
                      />
                    </div>
                  `
              }
            </div>
          `;
        })
        .join("");

      return `<div style="margin-bottom:20px;">${groupHeaderHtml}${questionsHtml}</div>`;
    })
    .join("");
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
            box.style.boxShadow = "0 0 0 2px #93c5fd";
          } else {
            box.style.background = "#f8fafc";
            box.style.borderColor = "#cbd5e1";
            box.style.boxShadow = "none";
          }
        });
      }
    });
  });

  updateExamProgress();
}

function updateExamShortAnswer(questionId, val) {
  if (examUserAnswers[questionId]) {
    examUserAnswers[questionId].short_answer_text = val;
  }
  updateExamProgress();
}

function updateExamProgress() {
  const all = Object.values(examUserAnswers);
  const done = all.filter(a => a.selected_choice_id || (a.short_answer_text && a.short_answer_text.trim())).length;
  document.getElementById("ke-progress-text").textContent = `${done} / ${all.length} 응답 완료`;
}

function startExamCountdown() {
  stopExamTimer();
  const timerEl = document.getElementById("ke-timer");
  timerEl.textContent = formatMMSS(examRemainingSeconds);
  timerEl.style.color = "#fbbf24";

  examTimerInterval = setInterval(() => {
    examRemainingSeconds -= 1;
    timerEl.textContent = formatMMSS(examRemainingSeconds);
    if (examRemainingSeconds <= 30) timerEl.style.color = "#f87171";

    if (examRemainingSeconds <= 0) {
      stopExamTimer();
      showMsg("제한 시간이 만료되어 답안이 자동 제출됩니다.", true);
      submitKoreanExam(true);
    }
  }, 1000);
}

async function submitKoreanExam(isTimeout = false) {
  if (!isTimeout) {
    const all = Object.values(examUserAnswers);
    const unanswered = all.filter(a => !a.selected_choice_id && !(a.short_answer_text && a.short_answer_text.trim())).length;
    if (unanswered > 0 && !confirm(`아직 작성하지 않은 문항이 ${unanswered}개 있습니다. 제출하시겠습니까?`)) {
      return;
    }
  }

  stopAllExamAudio();
  stopExamTimer();

  const elapsed_seconds = Math.max(0, examTotalSeconds - examRemainingSeconds);
  const res = await fetch("/api/v1/modules/korean_exam/submit", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      exam_title: currentExamPaper.exam_title,
      elapsed_seconds,
      time_limit_seconds: examTotalSeconds,
      series_id: currentExamPaper.series_id || null,
      attempt_mode: currentExamPaper.attempt_mode || "NEW",
      answers: Object.values(examUserAnswers)
    })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "채점 오류", true);

  lastExamGradeResult = data;
  document.getElementById("kexam-play-box").classList.add("hidden");
  document.getElementById("kexam-result-box").classList.remove("hidden");

  const roundLabel = `${data.round_no || 1}회차 (${getAttemptModeLabel(data.attempt_mode)})`;
  document.getElementById("ke-result-summary").innerHTML = `
    <div style="font-size:13px; font-weight:700; color:#1e40af;">${data.exam_title} · [${roundLabel}] 채점 결과</div>
    <div style="font-size:38px; font-weight:900; color:#1d4ed8; margin:6px 0;">${data.score}점 <span style="font-size:16px; color:#475569;">(획득 ${data.earned_points} / 만점 ${data.total_points}점)</span></div>
    <div style="font-size:14px; color:#334155;">
      총 <b>${data.total_questions}</b>문항 중
      <span style="color:#16a34a; font-weight:700;">정답 ${data.correct_count}개</span> /
      <span style="color:#dc2626; font-weight:700;">오답 ${data.wrong_count}개</span>
      &nbsp;|&nbsp; 소요 시간: <b>${formatMMSS(data.elapsed_seconds)}</b>
    </div>
    <div style="margin-top:8px; font-size:12px; color:${data.is_saved ? "#166534" : "#b45309"};">
      ${data.is_saved ? `✔ [내 시험 기록]에 ${data.round_no}회차 기록으로 자동 저장되었습니다.` : "※ 비로그인 상태이므로 현재 DB에 저장되지 않았습니다."}
    </div>
  `;

  const actionsEl = document.getElementById("ke-result-actions");
  if (data.attempt_id) {
    actionsEl.innerHTML = `
      ${data.wrong_count > 0 ? `
        <button type="button" style="flex:1; background:#d97706; padding:11px;" onclick="retryExamFromAttempt('${data.attempt_id}', 'RETRY_WRONG')">
          틀린 문항만 다시 시험보기 (${data.wrong_count}문항 · ${data.round_no + 1}회차)
        </button>` : ""}
      <button type="button" style="flex:1; background:#7c3aed; padding:11px;" onclick="retryExamFromAttempt('${data.attempt_id}', 'RETRY_ALL')">
        전체 시험 다시보기 (${data.total_questions}문항 · ${data.round_no + 1}회차)
      </button>
      <button type="button" class="secondary" style="padding:11px 16px;" onclick="resetKexamToSetup()">새 시험 응시하기</button>
    `;
  } else {
    handleGuestResultConversion(data);
  }

  renderExamResultDetails("ALL");
}

function renderExamResultDetails(mode) {
  if (!lastExamGradeResult) return;
  document.getElementById("ke-res-all").className = mode === "ALL" ? "" : "secondary";
  document.getElementById("ke-res-wrong").className = mode === "WRONG" ? "" : "secondary";

  const items = mode === "WRONG"
    ? lastExamGradeResult.detail_results.filter(r => !r.is_correct)
    : lastExamGradeResult.detail_results;

  const container = document.getElementById("ke-result-list");
  if (!items.length) {
    container.innerHTML = `<p style="text-align:center; color:#16a34a; font-weight:700; padding:20px;">틀린 문제가 없습니다!</p>`;
    return;
  }

  container.innerHTML = items.map(r => `
    <div class="word-card" style="background:${r.is_correct ? "#f0fdf4" : "#fef2f2"}; border-color:${r.is_correct ? "#bbf7d0" : "#fecaca"};">
      <div>
        <span class="tag" style="background:${r.is_correct ? "#16a34a" : "#dc2626"}; color:#fff;">
          ${r.display_no}번 · ${r.is_correct ? "정답 (O)" : "오답 (X)"} (${r.earned_points}/${r.max_points}점)
        </span>
        <span class="pos-badge">${r.question_type === "MCQ" ? "객관식" : "주관식"} · ${r.level}</span>
      </div>
      <div style="font-weight:700; font-size:15px; margin:8px 0;">${r.prompt_text}</div>
      <div style="font-size:13px; line-height:1.7;">
        <div><b>제출한 답:</b> <span style="color:${r.is_correct ? "#166534" : "#b91c1c"}; font-weight:700;">${r.user_answer}</span></div>
        ${!r.is_correct ? `<div><b>정답:</b> <span style="color:#15803d; font-weight:800;">${r.correct_answer}</span></div>` : ""}
        ${r.explanation ? `<div style="margin-top:6px; padding:8px; background:#fff; border-radius:6px; color:#334155;"><b>해설:</b> ${r.explanation}</div>` : ""}
      </div>
    </div>
  `).join("");
}