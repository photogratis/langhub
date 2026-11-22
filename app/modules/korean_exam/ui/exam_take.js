/* =========================================================
   korean_exam/ui/exam_take.js — 시험 응시, 답안 입력, 채점 제출 및 공유 모달
   ========================================================= */

function switchExamSetupMode(mode) {
  const isPaper = mode === "PAPER";
  document.getElementById("kexam-paper-select-box")?.classList.toggle("hidden", !isPaper);
  document.getElementById("kexam-random-setup-box")?.classList.toggle("hidden", isPaper);
  const btnPaper = document.getElementById("ke-mode-btn-paper");
  const btnRandom = document.getElementById("ke-mode-btn-random");
  if (btnPaper) btnPaper.className = isPaper ? "" : "secondary";
  if (btnRandom) btnRandom.className = !isPaper ? "" : "secondary";
}

async function loadPublishedExamPapersForStudent() {
  const container = document.getElementById("ke-published-papers-list");
  if (!container) return;

  const res = await fetch("/api/v1/modules/korean_exam/papers", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">시험지 목록을 불러오지 못했습니다.</p>`;
    return;
  }
  const papers = await res.json();

  container.innerHTML = papers.length
    ? papers.map(p => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div>
            <span class="tag" style="background:#dbeafe; color:#1e40af;">${p.level} · ${p.category}</span>
            <strong style="font-size:15px; margin-left:4px;">${p.title}</strong>
            <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
              ${p.description || "선생님이 출제한 실전 모의고사입니다."} · <b>${(p.items || []).length}문항</b> · 총 <b>${p.total_points}점</b> · 제한시간 <b>${Math.round((p.time_limit_seconds || 600) / 60)}분</b>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="secondary" style="padding:7px 10px; font-size:12px;" onclick="openExamShareModal('${p.id}', '${(p.title || "").replace(/'/g, "\\'")}')">링크·QR</button>
            <button type="button" style="background:#1d4ed8; padding:7px 14px;" onclick="startPublishedPaperExam('${p.id}')">응시 시작 →</button>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:18px;">현재 공개된 공식 시험지가 없습니다. 우측 상단의 <b>[조건별 랜덤 출제]</b>를 이용해 보세요.</p>`;
}

async function startPublishedPaperExam(paperId) {
  clearMsg();
  const res = await fetch(`/api/v1/modules/korean_exam/papers/${paperId}/start`, {
    method: "POST",
    headers: getAuthHeaders(false)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "시험지 시작 실패"), true);
  beginExamSession(data);
}

async function startKoreanExam(event) {
  event.preventDefault();
  clearMsg();

  const payload = {
    exam_title: document.getElementById("ke-title").value.trim(),
    level: document.getElementById("ke-level").value || null,
    category: document.getElementById("ke-category").value || null,
    question_type: document.getElementById("ke-qtype").value || null,
    max_questions: parseInt(document.getElementById("ke-max-q").value || "10", 10),
    time_limit_seconds: parseInt(document.getElementById("ke-mins").value || "10", 10) * 60,
    tag: document.getElementById("ke-tag").value.trim() || null
  };

  const res = await fetch("/api/v1/modules/korean_exam/generate", {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "시험지 생성 실패"), true);
  beginExamSession(data);
}

async function retryExamFromAttempt(attemptId, retryMode) {
  clearMsg();
  const res = await fetch("/api/v1/modules/korean_exam/retry", {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify({ attempt_id: attemptId, retry_mode: retryMode })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "재시험 생성 실패"), true);
  switchKexamTab("take");
  beginExamSession(data);
}

function beginExamSession(paperData) {
  currentExamPaper = paperData;
  examUserAnswers = {};
  examTotalSeconds = paperData.time_limit_seconds || 600;
  examRemainingSeconds = examTotalSeconds;

  document.getElementById("kexam-setup-box")?.classList.add("hidden");
  document.getElementById("kexam-result-box")?.classList.add("hidden");
  document.getElementById("kexam-play-box")?.classList.remove("hidden");

  document.getElementById("ke-round-badge").textContent = `${paperData.round_no || 1}회차 · ${getAttemptModeLabel(paperData.attempt_mode)}`;
  document.getElementById("ke-play-title").textContent = paperData.exam_title;
  updateExamProgressText();
  renderExamPaperSections();
  startExamTimer();

  if (document.getElementById("ke-auto-play")?.checked && paperData.sections?.length > 0) {
    playQuestionSequence(0, 0);
  }
}

function renderExamPaperSections() {
  const container = document.getElementById("ke-sections-container");
  if (!container || !currentExamPaper) return;

  container.innerHTML = (currentExamPaper.sections || []).map((sec, sIdx) => {
    const g = sec.group_info;
    const groupHeader = g ? `
      <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:8px; padding:12px; margin-bottom:10px;">
        <div style="font-weight:800; color:#5b21b6; margin-bottom:4px;">${g.instruction}</div>
        ${g.passage_text ? `<div style="background:#fff; border:1px solid #e2e8f0; padding:10px; border-radius:6px; white-space:pre-line; font-size:14px;">${g.passage_text}</div>` : ""}
        ${g.image_url ? `<img src="${g.image_url}" style="max-width:100%; max-height:260px; margin-top:8px; border-radius:6px;" />` : ""}
      </div>` : "";

    const qCards = (sec.questions || []).map((q, qIdx) => {
      const hasAudio = Boolean((g && (g.audio_url || g.tts_text)) || q.audio_url || q.tts_text || (q.choices || []).some(c => c.audio_url || c.tts_text));
      const answerHtml = q.question_type === "MCQ"
        ? (q.choices || []).map((ch, cIdx) => `
            <label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:6px; cursor:pointer; background:#fff;">
              <input type="radio" name="q_${q.question_id}_${q.display_no}" value="${ch.id}" style="width:auto;" onchange="recordMcqAnswer('${q.question_id}', ${q.display_no}, '${ch.id}')" />
              <span><b>${cIdx + 1}.</b> ${ch.text || ""}</span>
              ${ch.image_url ? `<img src="${ch.image_url}" style="max-height:70px; border-radius:4px;" />` : ""}
            </label>`).join("")
        : `<input type="text" placeholder="정답을 입력하세요..." oninput="recordShortAnswer('${q.question_id}', ${q.display_no}, this.value)" />`;

      return `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:12px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div>
              <span class="tag" style="background:#1e293b; color:#fff;">${q.display_no}번</span>
              <span class="tag">${q.points}점</span>
              <strong style="font-size:15px; margin-left:4px;">${q.prompt_text}</strong>
            </div>
            ${hasAudio ? `<button type="button" style="background:#0284c7; padding:5px 10px; font-size:12px;" onclick="playQuestionSequence(${sIdx}, ${qIdx})">▶ 듣기 재생</button>` : ""}
          </div>
          ${q.passage_text ? `<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:10px; border-radius:6px; margin-bottom:10px; white-space:pre-line;">${q.passage_text}</div>` : ""}
          ${q.image_url ? `<img src="${q.image_url}" style="max-width:100%; max-height:260px; margin-bottom:10px; border-radius:6px;" />` : ""}
          <div>${answerHtml}</div>
        </div>`;
    }).join("");

    return `<div style="margin-bottom:16px;">${groupHeader}${qCards}</div>`;
  }).join("");
}

function recordMcqAnswer(questionId, displayNo, choiceId) {
  examUserAnswers[displayNo] = { question_id: questionId, display_no: displayNo, selected_choice_id: choiceId };
  updateExamProgressText();
}

function recordShortAnswer(questionId, displayNo, text) {
  if (text.trim()) {
    examUserAnswers[displayNo] = { question_id: questionId, display_no: displayNo, short_answer_text: text };
  } else {
    delete examUserAnswers[displayNo];
  }
  updateExamProgressText();
}

function updateExamProgressText() {
  const total = currentExamPaper?.total_questions || 0;
  const answered = Object.keys(examUserAnswers).length;
  const el = document.getElementById("ke-progress-text");
  if (el) el.textContent = `${answered} / ${total} 응답`;
}

function startExamTimer() {
  stopExamTimer();
  const timerEl = document.getElementById("ke-timer");
  if (timerEl) timerEl.textContent = formatMMSS(examRemainingSeconds);

  examTimerInterval = setInterval(() => {
    examRemainingSeconds -= 1;
    if (timerEl) timerEl.textContent = formatMMSS(examRemainingSeconds);
    if (examRemainingSeconds <= 0) {
      stopExamTimer();
      submitKoreanExam(true);
    }
  }, 1000);
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
  document.getElementById("kexam-play-box")?.classList.add("hidden");
  document.getElementById("kexam-result-box")?.classList.add("hidden");
  document.getElementById("kexam-setup-box")?.classList.remove("hidden");
}

async function submitKoreanExam(isTimeout = false) {
  if (!currentExamPaper) return;
  if (!isTimeout && !confirm("답안을 제출하고 채점하시겠습니까?")) return;

  stopAllExamAudio();
  stopExamTimer();

  const allQuestions = (currentExamPaper.sections || []).flatMap(s => s.questions || []);
  const answersPayload = allQuestions.map(q => {
    const saved = examUserAnswers[q.display_no] || {};
    return {
      question_id: q.question_id,
      display_no: q.display_no,
      points: q.points,
      selected_choice_id: saved.selected_choice_id || null,
      short_answer_text: saved.short_answer_text || null
    };
  });

  const payload = {
    exam_title: currentExamPaper.exam_title,
    elapsed_seconds: Math.max(0, examTotalSeconds - examRemainingSeconds),
    time_limit_seconds: examTotalSeconds,
    series_id: currentExamPaper.series_id || null,
    attempt_mode: currentExamPaper.attempt_mode || "NEW",
    answers: answersPayload
  };

  const res = await fetch("/api/v1/modules/korean_exam/submit", {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  });
  const result = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(result, "채점 제출 실패"), true);

  lastExamGradeResult = result;
  if (!currentUser) {
    sessionStorage.setItem(GUEST_PENDING_RESULT_KEY, JSON.stringify(payload));
  }

  document.getElementById("kexam-play-box")?.classList.add("hidden");
  document.getElementById("kexam-result-box")?.classList.remove("hidden");

  document.getElementById("ke-result-summary").innerHTML = `
    <div style="font-size:13px; color:#1e40af; font-weight:700;">${result.exam_title} (${result.round_no}회차)</div>
    <div style="font-size:32px; font-weight:900; color:#1d4ed8; margin:6px 0;">${result.score}점 <span style="font-size:15px; color:#475569;">(${result.earned_points} / ${result.total_points}점)</span></div>
    <div style="font-size:14px;">총 ${result.total_questions}문항 중 <b style="color:#16a34a;">정답 ${result.correct_count}개</b> · <b style="color:#dc2626;">오답 ${result.wrong_count}개</b> · 소요시간 ${formatMMSS(result.elapsed_seconds)}</div>
  `;

  document.getElementById("ke-result-actions").innerHTML = `
    ${result.saved_to_history && result.wrong_count > 0 ? `<button type="button" style="background:#d97706;" onclick="retryExamFromAttempt('${result.attempt_id}', 'RETRY_WRONG')">틀린 문항만 다시보기 (${result.wrong_count}문항)</button>` : ""}
    ${result.saved_to_history ? `<button type="button" style="background:#7c3aed;" onclick="retryExamFromAttempt('${result.attempt_id}', 'RETRY_ALL')">전체 다시보기</button>` : ""}
    <button type="button" class="secondary" onclick="resetKexamToSetup()">시험 목록으로 돌아가기</button>
  `;

  renderExamResultDetails("ALL");
}

function renderExamResultDetails(filterMode) {
  const container = document.getElementById("ke-result-list");
  if (!container || !lastExamGradeResult) return;

  const list = (lastExamGradeResult.detail_results || []).filter(r => filterMode === "ALL" || !r.is_correct);
  container.innerHTML = list.length
    ? list.map(r => `
        <div class="word-card" style="background:${r.is_correct ? "#f0fdf4" : "#fef2f2"}; border-color:${r.is_correct ? "#bbf7d0" : "#fecaca"}; margin-bottom:10px; padding:12px;">
          <span class="tag" style="background:${r.is_correct ? "#16a34a" : "#dc2626"}; color:#fff;">${r.display_no}번 · ${r.is_correct ? "정답" : "오답"} (${r.earned_points}/${r.max_points}점)</span>
          <strong style="margin-left:6px;">${r.prompt_text}</strong>
          <div style="font-size:13px; margin-top:6px;">
            내 답안: <b>${r.user_answer}</b> | 정답: <b style="color:#15803d;">${r.correct_answer}</b>
            ${r.explanation ? `<div style="color:#475569; margin-top:4px;">해설: ${r.explanation}</div>` : ""}
          </div>
        </div>`).join("")
    : `<p style="color:#16a34a; text-align:center; padding:16px;">틀린 문항이 없습니다!</p>`;
}

async function claimPendingGuestResult() {
  const raw = sessionStorage.getItem(GUEST_PENDING_RESULT_KEY);
  if (!raw || !currentUser) return;
  try {
    const payload = JSON.parse(raw);
    const res = await fetch("/api/v1/modules/korean_exam/submit", {
      method: "POST",
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      sessionStorage.removeItem(GUEST_PENDING_RESULT_KEY);
      showMsg("비회원 상태로 응시했던 직전 시험 결과가 내 시험 기록에 자동 저장되었습니다.");
    }
  } catch (e) {
    console.error(e);
  }
}

/* =========================================================
   공유 링크 & QR코드 모달
   ========================================================= */
function openExamShareModal(paperId, title) {
  const modal = document.getElementById("ke-share-modal");
  if (!modal) return;
  const shareUrl = `${window.location.origin}/?module=korean_exam&paper_id=${encodeURIComponent(paperId)}`;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`;

  document.getElementById("ke-share-modal-title").textContent = `[${title}] 배포 링크 & QR코드`;
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
  navigator.clipboard?.writeText(input.value);
  showMsg("시험지 배포 링크가 클립보드에 복사되었습니다.");
}

async function loadSharedPaperLanding(paperId) {
  const box = document.getElementById("ke-shared-paper-landing");
  if (!box) return;
  const res = await fetch("/api/v1/modules/korean_exam/papers", { headers: getAuthHeaders(false) });
  if (!res.ok) return;
  const papers = await res.json();
  const target = papers.find(p => String(p.id) === String(paperId));
  if (!target) return;

  box.classList.remove("hidden");
  box.innerHTML = `
    <div style="font-size:12px; font-weight:700; color:#1d4ed8; margin-bottom:4px;">공유 링크로 지정된 시험지</div>
    <h3 style="margin:0 0 6px 0;">${target.title}</h3>
    <p style="margin:0 0 12px 0; font-size:13px; color:#334155;">${target.description || ""} (${(target.items || []).length}문항 · 총 ${target.total_points}점 · ${Math.round((target.time_limit_seconds || 600) / 60)}분)</p>
    <button type="button" style="background:#1d4ed8; padding:9px 18px;" onclick="startPublishedPaperExam('${target.id}')">바로 이 시험 응시하기 →</button>
  `;
}