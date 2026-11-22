var qzQuestions = [];
var qzUserSelections = {}; // { question_no: { choice_id, text } }
var qzTimerInterval = null;
var qzTotalSeconds = 180;
var qzRemainingSeconds = 180;
var qzLastGradeData = null;

function initVocabQuizModule() {
  stopQuizTimer();
  resetVocabQuizToSetup();
}

function stopQuizTimer() {
  if (qzTimerInterval) {
    clearInterval(qzTimerInterval);
    qzTimerInterval = null;
  }
}

function formatSecondsMMSS(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resetVocabQuizToSetup() {
  stopQuizTimer();
  clearMsg();
  qzQuestions = [];
  qzUserSelections = {};
  qzLastGradeData = null;

  document.getElementById("quiz-setup-view").classList.remove("hidden");
  document.getElementById("quiz-play-view").classList.add("hidden");
  document.getElementById("quiz-result-view").classList.add("hidden");
}

async function startVocabQuiz(e) {
  e.preventDefault();
  clearMsg();

  const question_count = parseInt(document.getElementById("qz-count").value, 10) || 10;
  const mins = parseInt(document.getElementById("qz-minutes").value, 10) || 0;
  const secs = parseInt(document.getElementById("qz-seconds").value, 10) || 0;
  const time_limit_seconds = mins * 60 + secs;

  if (time_limit_seconds < 10) {
    return showMsg("풀이 시간은 최소 10초 이상으로 설정해 주세요.", true);
  }

  const direction = document.getElementById("qz-direction").value;
  const tag = document.getElementById("qz-tag").value.trim() || null;

  const res = await fetch("/api/v1/modules/ko_id_vocab_quiz/generate", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ question_count, time_limit_seconds, direction, tag })
  });

  const data = await res.json();
  if (!res.ok) {
    return showMsg(data.detail || "시험 문제를 생성할 수 없습니다.", true);
  }

  qzQuestions = data.questions || [];
  qzUserSelections = {};
  qzTotalSeconds = data.time_limit_seconds;
  qzRemainingSeconds = data.time_limit_seconds;

  document.getElementById("quiz-setup-view").classList.add("hidden");
  document.getElementById("quiz-result-view").classList.add("hidden");
  document.getElementById("quiz-play-view").classList.remove("hidden");

  renderQuizQuestions();
  updateQuizProgress();
  startQuizCountdown();
}

function renderQuizQuestions() {
  const container = document.getElementById("qz-questions-container");
  container.innerHTML = qzQuestions.map(q => {
    const dirLabel = q.direction === "ko_to_id" ? "한국어 → 인도네시아어" : "인도네시아어 → 한국어";
    return `
      <div class="word-card" id="qz-card-${q.question_no}" style="background:#fff; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <div>
            <span class="tag" style="background:#1e293b; color:#fff;">문제 ${q.question_no}</span>
            <span class="pos-badge">${q.pos || "단어"}</span>
          </div>
          <small style="color:#64748b;">${dirLabel}</small>
        </div>

        <div style="font-size:20px; font-weight:800; color:#0f172a; margin:8px 0 14px 0;">
          ${q.prompt_word}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          ${q.choices.map((ch, idx) => `
            <button
              type="button"
              id="qz-btn-${q.question_no}-${ch.choice_id}"
              class="secondary"
              style="text-align:left; background:#f1f5f9; color:#1e293b; border:1px solid #cbd5e1; padding:10px 12px; font-weight:600;"
              onclick='selectQuizChoice(${q.question_no}, "${ch.choice_id}", ${JSON.stringify(ch.text)})'
            >
              ${idx + 1}. ${ch.text}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function selectQuizChoice(questionNo, choiceId, text) {
  qzUserSelections[questionNo] = { choice_id: choiceId, text };

  const q = qzQuestions.find(item => item.question_no === questionNo);
  if (q) {
    q.choices.forEach(ch => {
      const btn = document.getElementById(`qz-btn-${questionNo}-${ch.choice_id}`);
      if (!btn) return;
      if (ch.choice_id === choiceId) {
        btn.style.background = "#2563eb";
        btn.style.color = "#fff";
        btn.style.borderColor = "#1d4ed8";
      } else {
        btn.style.background = "#f1f5f9";
        btn.style.color = "#1e293b";
        btn.style.borderColor = "#cbd5e1";
      }
    });
  }
  updateQuizProgress();
}

function updateQuizProgress() {
  const answeredCount = Object.keys(qzUserSelections).length;
  document.getElementById("qz-progress-text").textContent = `${answeredCount} / ${qzQuestions.length} 완료`;
}

function startQuizCountdown() {
  stopQuizTimer();
  const timerEl = document.getElementById("qz-timer-display");
  timerEl.textContent = formatSecondsMMSS(qzRemainingSeconds);
  timerEl.style.color = "#38bdf8";

  qzTimerInterval = setInterval(() => {
    qzRemainingSeconds -= 1;
    timerEl.textContent = formatSecondsMMSS(qzRemainingSeconds);

    if (qzRemainingSeconds <= 15) {
      timerEl.style.color = "#f87171";
    }

    if (qzRemainingSeconds <= 0) {
      stopQuizTimer();
      showMsg("제한 시간이 종료되어 자동으로 답안이 제출되었습니다!", true);
      finishVocabQuiz(true);
    }
  }, 1000);
}

async function finishVocabQuiz(isTimeout = false) {
  if (!isTimeout) {
    const unanswered = qzQuestions.length - Object.keys(qzUserSelections).length;
    if (unanswered > 0 && !confirm(`아직 풀지 않은 문제가 ${unanswered}개 있습니다. 이대로 채점할까요?`)) {
      return;
    }
  }

  stopQuizTimer();
  const elapsed_seconds = Math.max(0, qzTotalSeconds - qzRemainingSeconds);

  const answers = qzQuestions.map(q => {
    const picked = qzUserSelections[q.question_no] || {};
    return {
      question_no: q.question_no,
      word_id: q.word_id,
      direction: q.direction,
      prompt_word: q.prompt_word,
      pos: q.pos,
      selected_choice_id: picked.choice_id || null,
      selected_text: picked.text || null,
      correct_choice_id: q.correct_choice_id,
      correct_text: q.correct_text
    };
  });

  const res = await fetch("/api/v1/modules/ko_id_vocab_quiz/grade", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ elapsed_seconds, answers })
  });

  const gradeData = await res.json();
  if (!res.ok) {
    return showMsg(gradeData.detail || "채점 중 오류가 발생했습니다.", true);
  }

  qzLastGradeData = gradeData;
  document.getElementById("quiz-play-view").classList.add("hidden");
  document.getElementById("quiz-result-view").classList.remove("hidden");

  document.getElementById("qz-score-summary").innerHTML = `
    <div style="font-size:14px; color:#1e40af; font-weight:700;">단어시험 최종 결과</div>
    <div style="font-size:36px; font-weight:900; color:#1d4ed8; margin:6px 0;">${gradeData.score}점</div>
    <div style="font-size:14px; color:#334155;">
      총 <b>${gradeData.total_questions}</b>문제 중
      <span style="color:#16a34a; font-weight:700;">정답 ${gradeData.correct_count}개</span> /
      <span style="color:#dc2626; font-weight:700;">오답 ${gradeData.wrong_count}개</span>
      &nbsp;|&nbsp; 소요 시간: <b>${formatSecondsMMSS(gradeData.elapsed_seconds)}</b>
    </div>
  `;

  filterQuizResults(gradeData.wrong_count > 0 ? "ALL" : "ALL");
}

function filterQuizResults(mode) {
  if (!qzLastGradeData) return;

  document.getElementById("btn-filter-all").className = mode === "ALL" ? "" : "secondary";
  document.getElementById("btn-filter-wrong").className = mode === "WRONG" ? "" : "secondary";

  const items = mode === "WRONG"
    ? qzLastGradeData.results.filter(r => !r.is_correct)
    : qzLastGradeData.results;

  const container = document.getElementById("qz-result-list");
  if (!items.length) {
    container.innerHTML = `<p style="text-align:center; color:#16a34a; font-weight:700; padding:20px;">틀린 문제가 없습니다! 만점을 축하합니다.</p>`;
    return;
  }

  container.innerHTML = items.map(r => `
    <div class="word-card" style="background:${r.is_correct ? "#f0fdf4" : "#fef2f2"}; border-color:${r.is_correct ? "#bbf7d0" : "#fecaca"};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="tag" style="background:${r.is_correct ? "#16a34a" : "#dc2626"}; color:#fff;">
            문제 ${r.question_no} · ${r.is_correct ? "정답 (O)" : "오답 (X)"}
          </span>
          <span class="pos-badge">${r.pos || "단어"}</span>
          <strong style="font-size:17px; margin-left:6px; color:#0f172a;">${r.prompt_word}</strong>
        </div>
      </div>

      <div style="margin-top:10px; font-size:13px; line-height:1.7;">
        ${r.is_correct
          ? `<div><b style="color:#166534;">내가 고른 답:</b> ${r.user_answer_text}</div>`
          : `
            <div><b style="color:#b91c1c;">내가 고른 오답:</b> <span style="text-decoration:line-through; color:#991b1b;">${r.user_answer_text}</span></div>
            <div><b style="color:#166534;">실제 정답:</b> <span style="font-weight:800; color:#15803d;">${r.correct_answer_text}</span></div>
          `
        }
      </div>
    </div>
  `).join("");
}