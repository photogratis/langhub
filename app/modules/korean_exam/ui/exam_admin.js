/* =========================================================
   korean_exam/ui/exam_admin.js — 선생님/관리자 시험지 · 문제은행 · 그룹 지문 관리
   ========================================================= */

var kqDraftChoices = [
  { id: "c1", text: "", image_url: "", audio_url: "", tts_text: "" },
  { id: "c2", text: "", image_url: "", audio_url: "", tts_text: "" },
  { id: "c3", text: "", image_url: "", audio_url: "", tts_text: "" },
  { id: "c4", text: "", image_url: "", audio_url: "", tts_text: "" }
];
var kqCorrectChoiceId = "c1";

function safeErrMsg(data, fallback) {
  if (typeof extractApiErrorMessage === "function") {
    return extractApiErrorMessage(data, fallback);
  }
  if (data && typeof data.detail === "string") return data.detail;
  return fallback;
}

/* =========================================================
   1. [출제] 그룹 지문 관리 (CRUD)
   ========================================================= */

async function loadExamGroupsList() {
  const container = document.getElementById("ke-groups-list");
  if (!container) return;

  try {
    const res = await fetch("/api/v1/modules/korean_exam/groups", {
      headers: getAuthHeaders(false)
    });
    if (!res.ok) {
      container.innerHTML = `<p style="color:#b91c1c;">그룹 지문 목록을 불러오지 못했습니다.</p>`;
      return;
    }
    kexamGroups = await res.json();

    container.innerHTML = kexamGroups.length
      ? kexamGroups.map(g => `
          <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
              <div>
                <span class="tag" style="background:#ede9fe; color:#5b21b6;">${g.level} · ${g.category}</span>
                <strong style="font-size:15px; margin-left:4px;">${g.title}</strong>
                <div style="font-size:13px; color:#334155; margin-top:4px;"><b>지시문:</b> ${g.instruction}</div>
                ${g.passage_text ? `<div style="font-size:12.5px; color:#475569; background:#f8fafc; padding:8px; border-radius:6px; margin-top:6px; white-space:pre-line;">${g.passage_text}</div>` : ""}
              </div>
              <div style="display:flex; gap:6px;">
                <button type="button" class="secondary" style="padding:5px 10px; font-size:12px;" onclick="editExamGroup('${g.id}')">수정</button>
                <button type="button" style="background:#dc2626; padding:5px 10px; font-size:12px;" onclick="deleteExamGroup('${g.id}')">삭제</button>
              </div>
            </div>
          </div>`).join("")
      : `<p style="color:#64748b; text-align:center; padding:16px;">등록된 공통 지문 그룹이 없습니다.</p>`;
  } catch (err) {
    container.innerHTML = `<p style="color:#b91c1c;">오류: ${err.message}</p>`;
  }
}

async function loadExamGroupsForSelect() {
  const selectEl = document.getElementById("kq-group-id");
  if (!selectEl) return;

  try {
    const res = await fetch("/api/v1/modules/korean_exam/groups", {
      headers: getAuthHeaders(false)
    });
    if (!res.ok) return;
    kexamGroups = await res.json();
    const prev = selectEl.value;
    selectEl.innerHTML = `<option value="">단독 문항 (그룹 없음)</option>` +
      kexamGroups.map(g => `<option value="${g.id}">[${g.level}/${g.category}] ${g.title}</option>`).join("");
    if (prev) selectEl.value = prev;
  } catch (e) {
    console.error("그룹 셀렉트 로드 오류:", e);
  }
}

async function saveExamGroup(event) {
  if (event) event.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const payload = {
    title: document.getElementById("kg-title").value.trim(),
    level: document.getElementById("kg-level").value,
    category: document.getElementById("kg-category").value,
    sample_count: parseInt(document.getElementById("kg-sample").value || "0", 10),
    instruction: document.getElementById("kg-instruction").value.trim(),
    passage_text: document.getElementById("kg-passage").value.trim(),
    image_url: document.getElementById("kg-image").value.trim(),
    audio_url: document.getElementById("kg-audio").value.trim(),
    tts_text: document.getElementById("kg-tts").value.trim(),
    tags: (document.getElementById("kg-tags").value || "").split(",").map(s => s.trim()).filter(Boolean)
  };

  const url = editingGroupId
    ? `/api/v1/modules/korean_exam/groups/${editingGroupId}`
    : "/api/v1/modules/korean_exam/groups";
  const method = editingGroupId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showMsg(safeErrMsg(data, "그룹 지문 저장 실패"), true);
    }

    cancelEditExamGroup();
    showMsg(editingGroupId ? "공통 지문 그룹이 수정되었습니다." : "새 공통 지문 그룹이 등록되었습니다.");
    await loadExamGroupsList();
    await loadExamGroupsForSelect();
  } catch (err) {
    showMsg(`네트워크 오류: ${err.message}`, true);
  }
}

function editExamGroup(groupId) {
  const g = kexamGroups.find(item => String(item.id) === String(groupId));
  if (!g) return;

  editingGroupId = g.id;
  document.getElementById("ke-grp-form-title").textContent = "공통 지문 그룹 수정";
  document.getElementById("kg-title").value = g.title || "";
  document.getElementById("kg-level").value = g.level || "초급";
  document.getElementById("kg-category").value = g.category || "듣기";
  document.getElementById("kg-sample").value = g.sample_count ?? 0;
  document.getElementById("kg-instruction").value = g.instruction || "";
  document.getElementById("kg-passage").value = g.passage_text || "";
  document.getElementById("kg-image").value = g.image_url || "";
  document.getElementById("kg-audio").value = g.audio_url || "";
  document.getElementById("kg-tts").value = g.tts_text || "";
  document.getElementById("kg-tags").value = (g.tags || []).join(", ");

  document.getElementById("kg-submit-btn").textContent = "그룹 수정 저장";
  document.getElementById("kg-cancel-btn")?.classList.remove("hidden");
  document.getElementById("kexam-sec-groups")?.scrollIntoView({ behavior: "smooth" });
}

function cancelEditExamGroup() {
  editingGroupId = null;
  document.getElementById("ke-grp-form-title").textContent = "새 공통 지문 그룹 등록";
  document.getElementById("kg-title").value = "";
  document.getElementById("kg-sample").value = "0";
  document.getElementById("kg-instruction").value = "";
  document.getElementById("kg-passage").value = "";
  document.getElementById("kg-image").value = "";
  document.getElementById("kg-audio").value = "";
  document.getElementById("kg-tts").value = "";
  document.getElementById("kg-tags").value = "";

  document.getElementById("kg-submit-btn").textContent = "그룹 저장하기";
  document.getElementById("kg-cancel-btn")?.classList.add("hidden");
}

async function deleteExamGroup(groupId) {
  if (!confirm("이 지문 그룹을 삭제하시겠습니까? 소속된 문항도 함께 삭제될 수 있습니다.")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/groups/${groupId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("그룹 삭제 실패", true);
  showMsg("공통 지문 그룹이 삭제되었습니다.");
  await loadExamGroupsList();
  await loadExamGroupsForSelect();
}

/* =========================================================
   2. [출제] 문제은행 문항 등록 및 관리 (CRUD)
   ========================================================= */

function toggleQuestionTypeFields() {
  const qType = document.getElementById("kq-type")?.value || "MCQ";
  const isMcq = qType === "MCQ";
  document.getElementById("kq-mcq-area")?.classList.toggle("hidden", !isMcq);
  document.getElementById("kq-short-area")?.classList.toggle("hidden", isMcq);
  if (isMcq) renderChoicesEditor();
}

function renderChoicesEditor() {
  const container = document.getElementById("kq-choices-list");
  if (!container) return;

  container.innerHTML = kqDraftChoices.map((ch, idx) => `
    <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin-bottom:8px; background:#f8fafc;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <input type="radio" name="kq-correct-radio" value="${ch.id}" ${kqCorrectChoiceId === ch.id ? "checked" : ""} style="width:auto; cursor:pointer;" onchange="kqCorrectChoiceId='${ch.id}'" />
        <strong style="font-size:13px; color:#1e293b;">${idx + 1}번 보기 (정답 선택)</strong>
      </div>
      <div class="row" style="gap:6px;">
        <div style="flex:2;">
          <input type="text" placeholder="${idx + 1}번 보기 텍스트 입력" value="${(ch.text || "").replace(/"/g, "&quot;")}" oninput="kqDraftChoices[${idx}].text=this.value" />
        </div>
        <div style="flex:1;">
          <input type="text" placeholder="이미지 URL (선택)" value="${(ch.image_url || "").replace(/"/g, "&quot;")}" oninput="kqDraftChoices[${idx}].image_url=this.value" />
        </div>
        <div style="flex:1;">
          <input type="text" placeholder="TTS 읽기 텍스트 (선택)" value="${(ch.tts_text || "").replace(/"/g, "&quot;")}" oninput="kqDraftChoices[${idx}].tts_text=this.value" />
        </div>
      </div>
    </div>
  `).join("");
}

async function loadBankQuestionsList(page = 1) {
  currentBankPage = page;
  const container = document.getElementById("ke-bank-list");
  if (!container) return;

  const q = document.getElementById("kq-search-q")?.value.trim() || "";
  const level = document.getElementById("kq-filter-level")?.value || "";
  const category = document.getElementById("kq-filter-category")?.value || "";

  const params = new URLSearchParams({ page: String(page), page_size: "10" });
  if (q) params.append("q", q);
  if (level) params.append("level", level);
  if (category) params.append("category", category);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">문제은행 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  const data = await res.json();
  kexamBankQuestions = data.items || [];

  container.innerHTML = kexamBankQuestions.length
    ? kexamBankQuestions.map(item => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
            <div style="flex:1;">
              <span class="tag" style="background:#dbeafe; color:#1e40af;">${item.level} · ${item.category}</span>
              <span class="tag">${item.question_type === "MCQ" ? "객관식" : "주관식"} · ${item.points}점</span>
              ${item.exam_question_groups ? `<span class="tag" style="background:#ede9fe; color:#5b21b6;">그룹: ${item.exam_question_groups.title}</span>` : ""}
              <div style="font-weight:700; font-size:14.5px; margin-top:6px;">${item.prompt_text}</div>
              ${item.passage_text ? `<div style="font-size:12.5px; color:#475569; margin-top:4px;">${item.passage_text}</div>` : ""}
              <div style="font-size:12px; color:#15803d; margin-top:6px;">
                정답: <b>${(item.correct_answers || []).join(", ")}</b>
              </div>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="secondary" style="padding:5px 10px; font-size:12px;" onclick="editExamQuestion('${item.id}')">수정</button>
              <button type="button" style="background:#dc2626; padding:5px 10px; font-size:12px;" onclick="deleteExamQuestion('${item.id}')">삭제</button>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:16px;">등록된 문항이 없습니다.</p>`;

  const pagEl = document.getElementById("ke-bank-pagination");
  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(data.page || 1, data.total_pages || 1, "loadBankQuestionsList");
  }
}

async function saveExamQuestion(event) {
  if (event) event.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  const qType = document.getElementById("kq-type").value;
  let choicesPayload = [];
  let correctAnswersPayload = [];

  if (qType === "MCQ") {
    choicesPayload = kqDraftChoices.map((c, idx) => ({
      id: c.id || `c${idx + 1}`,
      text: (c.text || "").trim(),
      image_url: (c.image_url || "").trim(),
      audio_url: (c.audio_url || "").trim(),
      tts_text: (c.tts_text || "").trim()
    }));
    const filledCount = choicesPayload.filter(c => c.text || c.image_url).length;
    if (filledCount < 2) {
      return showMsg("객관식 보기를 최소 2개 이상 입력해 주세요.", true);
    }
    correctAnswersPayload = [kqCorrectChoiceId || "c1"];
  } else {
    const rawAns = document.getElementById("kq-short-answers").value || "";
    correctAnswersPayload = rawAns.split(",").map(s => s.trim()).filter(Boolean);
    if (!correctAnswersPayload.length) {
      return showMsg("주관식 인정 정답을 최소 1개 이상 입력해 주세요.", true);
    }
  }

  const payload = {
    group_id: document.getElementById("kq-group-id").value || null,
    group_order: parseInt(document.getElementById("kq-group-order").value || "1", 10),
    question_type: qType,
    level: document.getElementById("kq-level").value,
    category: document.getElementById("kq-category").value,
    points: parseInt(document.getElementById("kq-points").value || "10", 10),
    prompt_text: document.getElementById("kq-prompt").value.trim(),
    passage_text: document.getElementById("kq-passage").value.trim(),
    image_url: document.getElementById("kq-image").value.trim(),
    audio_url: document.getElementById("kq-audio").value.trim(),
    tts_text: document.getElementById("kq-tts").value.trim(),
    choices: choicesPayload,
    correct_answers: correctAnswersPayload,
    shuffle_choices: Boolean(document.getElementById("kq-shuffle")?.checked),
    explanation: document.getElementById("kq-explanation").value.trim(),
    tags: (document.getElementById("kq-tags").value || "").split(",").map(s => s.trim()).filter(Boolean)
  };

  const url = editingQuestionId
    ? `/api/v1/modules/korean_exam/questions/${editingQuestionId}`
    : "/api/v1/modules/korean_exam/questions";
  const method = editingQuestionId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showMsg(safeErrMsg(data, "문항 저장 실패"), true);
    }

    cancelEditExamQuestion();
    showMsg(editingQuestionId ? "문항이 수정되었습니다." : "새 시험 문항이 저장되었습니다.");
    await loadBankQuestionsList(currentBankPage);
  } catch (err) {
    showMsg(`네트워크 오류: ${err.message}`, true);
  }
}

function editExamQuestion(questionId) {
  const item = kexamBankQuestions.find(q => String(q.id) === String(questionId));
  if (!item) return;

  editingQuestionId = item.id;
  document.getElementById("ke-q-form-title").textContent = "시험 문항 수정";
  document.getElementById("kq-group-id").value = item.group_id || "";
  document.getElementById("kq-group-order").value = item.group_order || 1;
  document.getElementById("kq-type").value = item.question_type || "MCQ";
  document.getElementById("kq-level").value = item.level || "초급";
  document.getElementById("kq-category").value = item.category || "읽기";
  document.getElementById("kq-points").value = item.points || 10;
  document.getElementById("kq-tags").value = (item.tags || []).join(", ");
  document.getElementById("kq-prompt").value = item.prompt_text || "";
  document.getElementById("kq-passage").value = item.passage_text || "";
  document.getElementById("kq-image").value = item.image_url || "";
  document.getElementById("kq-audio").value = item.audio_url || "";
  document.getElementById("kq-tts").value = item.tts_text || "";
  document.getElementById("kq-shuffle").checked = item.shuffle_choices !== false;
  document.getElementById("kq-explanation").value = item.explanation || "";

  if (item.question_type === "MCQ") {
    const existing = item.choices || [];
    kqDraftChoices = [0, 1, 2, 3].map(idx => ({
      id: existing[idx]?.id || `c${idx + 1}`,
      text: existing[idx]?.text || "",
      image_url: existing[idx]?.image_url || "",
      audio_url: existing[idx]?.audio_url || "",
      tts_text: existing[idx]?.tts_text || ""
    }));
    kqCorrectChoiceId = (item.correct_answers && item.correct_answers[0]) || "c1";
  } else {
    document.getElementById("kq-short-answers").value = (item.correct_answers || []).join(", ");
  }

  toggleQuestionTypeFields();
  document.getElementById("kq-submit-btn").textContent = "문항 수정 저장";
  document.getElementById("kq-cancel-btn")?.classList.remove("hidden");
  document.getElementById("kexam-sec-questions")?.scrollIntoView({ behavior: "smooth" });
}

function cancelEditExamQuestion() {
  editingQuestionId = null;
  document.getElementById("ke-q-form-title").textContent = "새 시험 문항 등록";
  document.getElementById("kq-group-id").value = "";
  document.getElementById("kq-group-order").value = "1";
  document.getElementById("kq-type").value = "MCQ";
  document.getElementById("kq-points").value = "10";
  document.getElementById("kq-tags").value = "";
  document.getElementById("kq-prompt").value = "";
  document.getElementById("kq-passage").value = "";
  document.getElementById("kq-image").value = "";
  document.getElementById("kq-audio").value = "";
  document.getElementById("kq-tts").value = "";
  document.getElementById("kq-short-answers").value = "";
  document.getElementById("kq-explanation").value = "";

  kqDraftChoices = [
    { id: "c1", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c2", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c3", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c4", text: "", image_url: "", audio_url: "", tts_text: "" }
  ];
  kqCorrectChoiceId = "c1";
  toggleQuestionTypeFields();

  document.getElementById("kq-submit-btn").textContent = "문항 저장하기";
  document.getElementById("kq-cancel-btn")?.classList.add("hidden");
}

async function deleteExamQuestion(questionId) {
  if (!confirm("이 문항을 문제은행에서 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/questions/${questionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("문항 삭제 실패", true);
  showMsg("문항이 삭제되었습니다.");
  await loadBankQuestionsList(currentBankPage);
}

/* =========================================================
   3. [출제] 공식 시험지 제작 및 배포 관리 (CRUD)
   ========================================================= */

async function loadPaperPickerQuestions(page = 1) {
  paperPickerPage = page;
  const container = document.getElementById("kp-picker-list");
  if (!container) return;

  const q = document.getElementById("kp-picker-q")?.value.trim() || "";
  const level = document.getElementById("kp-picker-level")?.value || "";

  const params = new URLSearchParams({ page: String(page), page_size: "12" });
  if (q) params.append("q", q);
  if (level) params.append("level", level);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c; font-size:12px;">문항 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  const data = await res.json();
  paperPickerQuestions = data.items || [];

  container.innerHTML = paperPickerQuestions.length
    ? paperPickerQuestions.map(item => {
        const alreadyAdded = paperSelectedItems.some(s => String(s.question_id) === String(item.id));
        return `
          <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:6px; background:${alreadyAdded ? "#f1f5f9" : "#fff"};">
            <div style="font-size:12.5px; flex:1;">
              <span class="tag">${item.level} · ${item.category}</span>
              <span class="tag">${item.points}점</span>
              <div style="font-weight:600; margin-top:3px;">${item.prompt_text}</div>
            </div>
            <button type="button" style="padding:4px 8px; font-size:11.5px; background:${alreadyAdded ? "#64748b" : "#2563eb"};" onclick="addQuestionToPaper('${item.id}')">
              ${alreadyAdded ? "추가됨" : "+ 추가"}
            </button>
          </div>`;
      }).join("")
    : `<p style="color:#64748b; font-size:12px; text-align:center; padding:12px;">선택 가능한 문항이 없습니다. 먼저 [출제] 문제은행에서 문항을 등록하세요.</p>`;

  const pagEl = document.getElementById("kp-picker-pagination");
  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(data.page || 1, data.total_pages || 1, "loadPaperPickerQuestions");
  }
}

function addQuestionToPaper(questionId) {
  const q = paperPickerQuestions.find(item => String(item.id) === String(questionId));
  if (!q) return;
  if (paperSelectedItems.some(s => String(s.question_id) === String(questionId))) {
    return showMsg("이미 시험지에 포함된 문항입니다.", true);
  }

  paperSelectedItems.push({
    question_id: q.id,
    prompt_text: q.prompt_text,
    level: q.level,
    category: q.category,
    points: q.points || 10
  });
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function removeQuestionFromPaper(idx) {
  paperSelectedItems.splice(idx, 1);
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function updatePaperItemPoints(idx, val) {
  const pts = Math.max(1, parseInt(val || "10", 10));
  if (paperSelectedItems[idx]) {
    paperSelectedItems[idx].points = pts;
    renderPaperSelectedItems();
  }
}

function renderPaperSelectedItems() {
  const listEl = document.getElementById("kp-selected-list");
  const sumEl = document.getElementById("kp-selected-summary");
  if (!listEl) return;

  const totalPts = paperSelectedItems.reduce((acc, cur) => acc + (cur.points || 0), 0);
  if (sumEl) sumEl.textContent = `총 ${paperSelectedItems.length}문항 · ${totalPts}점`;

  listEl.innerHTML = paperSelectedItems.length
    ? paperSelectedItems.map((item, idx) => `
        <div style="border:1px solid #cbd5e1; border-radius:6px; padding:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:6px; background:#f8fafc;">
          <div style="font-size:12.5px; flex:1;">
            <b>${idx + 1}번.</b> ${item.prompt_text}
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" value="${item.points}" min="1" style="width:58px; padding:3px 6px; font-size:12px;" onchange="updatePaperItemPoints(${idx}, this.value)" />
            <span style="font-size:11px;">점</span>
            <button type="button" style="background:#dc2626; padding:3px 7px; font-size:11px;" onclick="removeQuestionFromPaper(${idx})">✕</button>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; font-size:12px; text-align:center; padding:16px;">좌측 목록에서 [+ 추가]를 눌러 시험지 문항을 구성하세요.</p>`;
}

async function saveExamPaper(event) {
  if (event) event.preventDefault();
  if (typeof clearMsg === "function") clearMsg();

  if (!paperSelectedItems.length) {
    return showMsg("시험지에 최소 1개 이상의 문항을 추가해 주세요.", true);
  }

  const payload = {
    title: document.getElementById("kp-title").value.trim(),
    description: document.getElementById("kp-desc").value.trim(),
    level: document.getElementById("kp-level").value,
    category: document.getElementById("kp-category").value,
    time_limit_seconds: parseInt(document.getElementById("kp-mins").value || "10", 10) * 60,
    is_published: document.getElementById("kp-published").value === "true",
    items: paperSelectedItems.map((item, idx) => ({
      question_id: item.question_id,
      order: idx + 1,
      points: item.points || 10
    }))
  };

  const url = editingPaperId
    ? `/api/v1/modules/korean_exam/papers/${editingPaperId}`
    : "/api/v1/modules/korean_exam/papers";
  const method = editingPaperId ? "PUT" : "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(true),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return showMsg(safeErrMsg(data, "시험지 저장 실패"), true);
    }

    cancelEditExamPaper();
    showMsg(editingPaperId ? "시험지가 수정되었습니다." : "새 공식 시험지가 저장 및 배포되었습니다.");
    await loadManagedExamPapers();
  } catch (err) {
    showMsg(`네트워크 오류: ${err.message}`, true);
  }
}

async function loadManagedExamPapers() {
  const container = document.getElementById("ke-managed-papers-list");
  if (!container) return;

  const res = await fetch("/api/v1/modules/korean_exam/papers?include_unpublished=true", {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">시험지 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  managedPapersCache = await res.json();
  container.innerHTML = managedPapersCache.length
    ? managedPapersCache.map(p => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <span class="tag" style="background:${p.is_published ? "#dcfce7" : "#f1f5f9"}; color:${p.is_published ? "#166534" : "#475569"};">
              ${p.is_published ? "공개 배포중" : "비공개"}
            </span>
            <span class="tag">${p.level} · ${p.category}</span>
            <strong style="font-size:15px; margin-left:4px;">${p.title}</strong>
            <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
              ${(p.items || []).length}문항 · 총 ${p.total_points}점 · 제한시간 ${Math.round((p.time_limit_seconds || 600) / 60)}분
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" style="background:#0284c7; padding:5px 10px; font-size:12px;" onclick="openExamShareModal('${p.id}', '${(p.title || "").replace(/'/g, "\\'")}')">링크·QR</button>
            <button type="button" class="secondary" style="padding:5px 10px; font-size:12px;" onclick="editExamPaper('${p.id}')">수정</button>
            <button type="button" style="background:#dc2626; padding:5px 10px; font-size:12px;" onclick="deleteExamPaper('${p.id}')">삭제</button>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:16px;">제작된 시험지가 없습니다.</p>`;
}

function editExamPaper(paperId) {
  const p = managedPapersCache.find(item => String(item.id) === String(paperId));
  if (!p) return;

  editingPaperId = p.id;
  document.getElementById("ke-paper-form-title").textContent = "공식 시험지 수정";
  document.getElementById("kp-title").value = p.title || "";
  document.getElementById("kp-desc").value = p.description || "";
  document.getElementById("kp-level").value = p.level || "혼합";
  document.getElementById("kp-category").value = p.category || "종합";
  document.getElementById("kp-mins").value = Math.round((p.time_limit_seconds || 600) / 60);
  document.getElementById("kp-published").value = p.is_published ? "true" : "false";

  paperSelectedItems = (p.items || []).map(it => {
    const found = paperPickerQuestions.find(q => String(q.id) === String(it.question_id));
    return {
      question_id: it.question_id,
      prompt_text: found ? found.prompt_text : `문항 ID: ${it.question_id}`,
      points: it.points || 10
    };
  });

  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
  document.getElementById("kp-submit-btn").textContent = "시험지 수정 저장";
  document.getElementById("kp-cancel-btn")?.classList.remove("hidden");
  document.getElementById("kexam-sec-papers")?.scrollIntoView({ behavior: "smooth" });
}

function cancelEditExamPaper() {
  editingPaperId = null;
  document.getElementById("ke-paper-form-title").textContent = "새 공식 시험지 만들기";
  document.getElementById("kp-title").value = "";
  document.getElementById("kp-desc").value = "";
  document.getElementById("kp-mins").value = "10";
  document.getElementById("kp-published").value = "true";
  paperSelectedItems = [];
  renderPaperSelectedItems();
  loadPaperPickerQuestions(1);

  document.getElementById("kp-submit-btn").textContent = "시험지 저장 및 배포";
  document.getElementById("kp-cancel-btn")?.classList.add("hidden");
}

async function deleteExamPaper(paperId) {
  if (!confirm("이 시험지를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/papers/${paperId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("시험지 삭제 실패", true);
  showMsg("시험지가 삭제되었습니다.");
  await loadManagedExamPapers();
}