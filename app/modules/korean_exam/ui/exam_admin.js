/* =========================================================
   korean_exam/ui/exam_admin.js
   - 시험지 제작(kp-*), 문제은행 문항(kq-*), 그룹 지문(kg-*) 관리
   - widget.html의 실제 DOM ID와 100% 동기화
========================================================= */

var currentChoicesDraft = [];

/* =========================================================
   1. 공통 지문 그룹 관리 (kg-*)
========================================================= */
async function loadExamGroupsForSelect() {
  const res = await fetch("/api/v1/modules/korean_exam/groups", {
    headers: getAuthHeaders(false),
  });
  kexamGroups = res.ok ? await res.json() : [];

  const sel = document.getElementById("kq-group-id");
  if (sel) {
    sel.innerHTML =
      `<option value="">단독 문항 (그룹 없음)</option>` +
      kexamGroups
        .map(g => `<option value="${g.id}">[${g.level}/${g.category}] ${g.title}</option>`)
        .join("");
  }
}

async function loadExamGroupsList() {
  await loadExamGroupsForSelect();
  const container = document.getElementById("ke-groups-list");
  if (!container) return;

  if (!kexamGroups.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">등록된 공통 지문 그룹이 없습니다.</p>`;
    return;
  }

  container.innerHTML = kexamGroups
    .map(
      g => `
      <div class="word-card" style="background:#faf5ff; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <span class="pos-badge">${g.level} · ${g.category}</span>
            <strong style="margin-left:6px;">${g.title}</strong>
            <span class="tag" style="margin-left:6px;">
              ${g.sample_count > 0 ? `그룹 내 ${g.sample_count}문항 랜덤 추출` : "그룹 전체 출제"}
            </span>
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" style="padding:4px 9px; font-size:12px;" onclick="startEditExamGroup('${g.id}')">수정</button>
            <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteExamGroup('${g.id}')">삭제</button>
          </div>
        </div>
        <div style="font-size:13px; color:#475569; margin-top:6px;">지시문: ${g.instruction}</div>
        ${
          g.passage_text
            ? `<div style="font-size:12.5px; color:#334155; background:#fff; border:1px solid #e9d5ff; border-radius:6px; padding:8px; margin-top:6px; white-space:pre-line;">${g.passage_text}</div>`
            : ""
        }
      </div>
    `
    )
    .join("");
}

function startEditExamGroup(gid) {
  const g = kexamGroups.find(item => String(item.id) === String(gid));
  if (!g) return;

  editingGroupId = g.id;
  document.getElementById("kg-title").value = g.title || "";
  document.getElementById("kg-level").value = g.level || "초급";
  document.getElementById("kg-category").value = g.category || "읽기";
  document.getElementById("kg-sample").value = g.sample_count || 0;
  document.getElementById("kg-instruction").value = g.instruction || "";
  document.getElementById("kg-passage").value = g.passage_text || "";
  document.getElementById("kg-image").value = g.image_url || "";
  document.getElementById("kg-audio").value = g.audio_url || "";
  document.getElementById("kg-tts").value = g.tts_text || "";
  const tagsEl = document.getElementById("kg-tags");
  if (tagsEl) tagsEl.value = (g.tags || []).join(", ");

  document.getElementById("ke-grp-form-title").textContent = "공통 지문 그룹 수정 중";
  document.getElementById("kg-submit-btn").textContent = "그룹 수정 저장";
  document.getElementById("kg-cancel-btn").classList.remove("hidden");
}

function cancelEditExamGroup() {
  editingGroupId = null;
  const submitBtn = document.getElementById("kg-submit-btn");
  if (submitBtn && submitBtn.form) submitBtn.form.reset();

  document.getElementById("ke-grp-form-title").textContent = "새 공통 지문 그룹 등록";
  if (submitBtn) submitBtn.textContent = "그룹 저장하기";
  document.getElementById("kg-cancel-btn").classList.add("hidden");
}

async function saveExamGroup(e) {
  e.preventDefault();
  clearMsg();

  const tagsRaw = document.getElementById("kg-tags")?.value || "";
  const body = {
    title: document.getElementById("kg-title").value.trim(),
    level: document.getElementById("kg-level").value,
    category: document.getElementById("kg-category").value,
    sample_count: parseInt(document.getElementById("kg-sample").value, 10) || 0,
    instruction: document.getElementById("kg-instruction").value.trim(),
    passage_text: document.getElementById("kg-passage").value.trim(),
    image_url: document.getElementById("kg-image").value.trim(),
    audio_url: document.getElementById("kg-audio").value.trim(),
    tts_text: document.getElementById("kg-tts").value.trim(),
    tags: tagsRaw
      .split(",")
      .map(t => t.trim())
      .filter(Boolean),
  };

  const url = editingGroupId
    ? `/api/v1/modules/korean_exam/groups/${editingGroupId}`
    : "/api/v1/modules/korean_exam/groups";

  const res = await fetch(url, {
    method: editingGroupId ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return showMsg(data.detail || "문제 그룹 저장에 실패했습니다.", true);
  }

  cancelEditExamGroup();
  showMsg("문제 그룹이 저장되었습니다.");
  await loadExamGroupsList();
}

async function deleteExamGroup(gid) {
  if (!confirm("그룹을 삭제하면 소속된 문항도 함께 삭제될 수 있습니다. 계속할까요?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/groups/${gid}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("그룹 삭제 실패", true);
  showMsg("문제 그룹이 삭제되었습니다.");
  await loadExamGroupsList();
}

/* =========================================================
   2. 문제은행 개별 문항 관리 (kq-*) & 객관식 보기 에디터
========================================================= */
function toggleQuestionTypeFields() {
  const qType = document.getElementById("kq-type")?.value || "MCQ";
  const mcqArea = document.getElementById("kq-mcq-area");
  const shortArea = document.getElementById("kq-short-area");
  if (mcqArea) mcqArea.classList.toggle("hidden", qType !== "MCQ");
  if (shortArea) shortArea.classList.toggle("hidden", qType !== "SHORT");
}

function renderChoicesEditor(choices = [], correctChoiceId = "1") {
  const container = document.getElementById("kq-choices-list");
  if (!container) return;

  const list =
    Array.isArray(choices) && choices.length > 0
      ? choices
      : [
          { id: "1", text: "", image_url: "", audio_url: "", tts_text: "" },
          { id: "2", text: "", image_url: "", audio_url: "", tts_text: "" },
          { id: "3", text: "", image_url: "", audio_url: "", tts_text: "" },
          { id: "4", text: "", image_url: "", audio_url: "", tts_text: "" },
        ];

  currentChoicesDraft = list.map((c, idx) => ({
    id: String(c.id || idx + 1),
    text: c.text || "",
    image_url: c.image_url || "",
    audio_url: c.audio_url || "",
    tts_text: c.tts_text || "",
  }));

  container.innerHTML =
    currentChoicesDraft
      .map((c, idx) => {
        const isChecked = String(c.id) === String(correctChoiceId || "1");
        return `
          <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:8px; background:#f8fafc;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <label style="display:inline-flex; align-items:center; gap:4px; margin:0; font-weight:700; color:#1d4ed8; cursor:pointer; white-space:nowrap;">
                <input type="radio" name="kq-correct-choice" value="${c.id}" ${isChecked ? "checked" : ""} style="width:auto;" />
                보기 ${idx + 1} (정답)
              </label>
              <input type="text" id="kq-choice-text-${idx}" value="${escapeHtmlAttr(c.text)}" placeholder="보기 ${idx + 1} 텍스트 내용..." style="flex:1;" />
              ${
                currentChoicesDraft.length > 2
                  ? `<button type="button" class="danger" style="padding:4px 8px; font-size:11px;" onclick="removeChoiceRow(${idx})">삭제</button>`
                  : ""
              }
            </div>
            <div class="row" style="gap:6px;">
              <input type="text" id="kq-choice-img-${idx}" value="${escapeHtmlAttr(c.image_url)}" placeholder="보기 이미지 URL (선택)" style="font-size:12px;" />
              <input type="text" id="kq-choice-audio-${idx}" value="${escapeHtmlAttr(c.audio_url)}" placeholder="보기 오디오 URL (선택)" style="font-size:12px;" />
              <input type="text" id="kq-choice-tts-${idx}" value="${escapeHtmlAttr(c.tts_text)}" placeholder="보기 TTS 텍스트 (선택)" style="font-size:12px;" />
            </div>
          </div>
        `;
      })
      .join("") +
    `<button type="button" class="secondary" style="padding:5px 10px; font-size:12px;" onclick="addChoiceRow()">+ 보기 항목 추가</button>`;
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function syncChoicesDraftFromDom() {
  const checkedRadio = document.querySelector('input[name="kq-correct-choice"]:checked');
  const checkedId = checkedRadio ? checkedRadio.value : "1";

  currentChoicesDraft = currentChoicesDraft.map((c, idx) => ({
    id: String(c.id || idx + 1),
    text: document.getElementById(`kq-choice-text-${idx}`)?.value || "",
    image_url: document.getElementById(`kq-choice-img-${idx}`)?.value.trim() || "",
    audio_url: document.getElementById(`kq-choice-audio-${idx}`)?.value.trim() || "",
    tts_text: document.getElementById(`kq-choice-tts-${idx}`)?.value.trim() || "",
  }));

  return checkedId;
}

function addChoiceRow() {
  const checkedId = syncChoicesDraftFromDom();
  const nextId = String(currentChoicesDraft.length + 1);
  currentChoicesDraft.push({ id: nextId, text: "", image_url: "", audio_url: "", tts_text: "" });
  renderChoicesEditor(currentChoicesDraft, checkedId);
}

function removeChoiceRow(idx) {
  const checkedId = syncChoicesDraftFromDom();
  currentChoicesDraft.splice(idx, 1);
  currentChoicesDraft = currentChoicesDraft.map((c, i) => ({ ...c, id: String(i + 1) }));
  renderChoicesEditor(currentChoicesDraft, checkedId);
}

async function loadBankQuestionsList(page = 1) {
  currentBankPage = page;
  const q = document.getElementById("kq-search-q")?.value.trim() || "";
  const level = document.getElementById("kq-filter-level")?.value || "";
  const category = document.getElementById("kq-filter-category")?.value || "";

  const params = new URLSearchParams({ page: String(page), page_size: "15" });
  if (q) params.append("q", q);
  if (level) params.append("level", level);
  if (category) params.append("category", category);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  const container = document.getElementById("ke-bank-list");
  const pagContainer = document.getElementById("ke-bank-pagination");
  if (!container) return;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    container.innerHTML = `<p style="color:#b91c1c;">${err.detail || "문제은행 문항 조회 실패"}</p>`;
    return;
  }

  const data = await res.json();
  kexamBankQuestions = data.items || [];

  if (!kexamBankQuestions.length) {
    if (pagContainer) pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">등록된 시험 문항이 없습니다.</p>`;
    return;
  }

  container.innerHTML = kexamBankQuestions
    .map(item => {
      const grpTitle = item.exam_question_groups?.title;
      return `
        <div class="word-card" style="background:#fff; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
            <div>
              <span class="pos-badge">${item.question_type === "MCQ" ? "객관식" : "주관식"} · ${item.level} · ${item.category}</span>
              <span class="tag">기본 ${item.points || 10}점</span>
              ${grpTitle ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8;">그룹: ${grpTitle}</span>` : ""}
              <strong style="margin-left:6px;">${item.prompt_text}</strong>
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button type="button" style="padding:4px 9px; font-size:12px;" onclick="startEditExamQuestion('${item.id}')">수정</button>
              <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteExamQuestion('${item.id}')">삭제</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  if (pagContainer && typeof renderPaginationBar === "function") {
    pagContainer.innerHTML = renderPaginationBar(
      data.page || 1,
      data.total_pages || 1,
      "loadBankQuestionsList"
    );
  }
}

function startEditExamQuestion(qid) {
  const q = kexamBankQuestions.find(item => String(item.id) === String(qid));
  if (!q) return;

  editingQuestionId = q.id;
  document.getElementById("kq-group-id").value = q.group_id || "";
  document.getElementById("kq-group-order").value = q.group_order || 1;
  document.getElementById("kq-type").value = q.question_type || "MCQ";
  document.getElementById("kq-level").value = q.level || "초급";
  document.getElementById("kq-category").value = q.category || "읽기";
  document.getElementById("kq-points").value = q.points || 10;
  document.getElementById("kq-tags").value = (q.tags || []).join(", ");
  document.getElementById("kq-prompt").value = q.prompt_text || "";
  document.getElementById("kq-passage").value = q.passage_text || "";
  document.getElementById("kq-image").value = q.image_url || "";
  document.getElementById("kq-audio").value = q.audio_url || "";
  document.getElementById("kq-tts").value = q.tts_text || "";
  document.getElementById("kq-explanation").value = q.explanation || "";

  const shuffleEl = document.getElementById("kq-shuffle");
  if (shuffleEl) shuffleEl.checked = q.shuffle_choices !== false;

  toggleQuestionTypeFields();
  if ((q.question_type || "MCQ") === "MCQ") {
    renderChoicesEditor(q.choices || [], q.correct_choice_id || "1");
  } else {
    document.getElementById("kq-short-answers").value = (q.correct_short_answers || []).join(", ");
  }

  document.getElementById("ke-q-form-title").textContent = "시험 문항 수정 중";
  document.getElementById("kq-submit-btn").textContent = "문항 수정 저장";
  document.getElementById("kq-cancel-btn").classList.remove("hidden");
  document.getElementById("ke-q-form-title").scrollIntoView({ behavior: "smooth" });
}

function cancelEditExamQuestion() {
  editingQuestionId = null;
  const submitBtn = document.getElementById("kq-submit-btn");
  if (submitBtn && submitBtn.form) submitBtn.form.reset();

  document.getElementById("kq-type").value = "MCQ";
  toggleQuestionTypeFields();
  renderChoicesEditor([], "1");

  document.getElementById("ke-q-form-title").textContent = "새 시험 문항 등록";
  if (submitBtn) submitBtn.textContent = "문항 저장하기";
  document.getElementById("kq-cancel-btn").classList.add("hidden");
}

async function saveExamQuestion(e) {
  e.preventDefault();
  clearMsg();

  const qType = document.getElementById("kq-type").value;
  const groupId = document.getElementById("kq-group-id").value || null;
  const checkedChoiceId = syncChoicesDraftFromDom();

  const validChoices = currentChoicesDraft.filter(
    c => c.text.trim() || c.image_url.trim() || c.audio_url.trim() || c.tts_text.trim()
  );

  if (qType === "MCQ" && validChoices.length < 2) {
    return showMsg("객관식 문항은 최소 2개 이상의 보기를 입력해야 합니다.", true);
  }

  const shortAnswers = (document.getElementById("kq-short-answers")?.value || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (qType === "SHORT" && !shortAnswers.length) {
    return showMsg("주관식 정답을 최소 1개 이상 입력해 주세요.", true);
  }

  const body = {
    group_id: groupId,
    group_order: parseInt(document.getElementById("kq-group-order").value, 10) || 1,
    question_type: qType,
    level: document.getElementById("kq-level").value,
    category: document.getElementById("kq-category").value,
    points: parseInt(document.getElementById("kq-points").value, 10) || 10,
    tags: (document.getElementById("kq-tags").value || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean),
    prompt_text: document.getElementById("kq-prompt").value.trim(),
    passage_text: document.getElementById("kq-passage").value.trim(),
    image_url: document.getElementById("kq-image").value.trim(),
    audio_url: document.getElementById("kq-audio").value.trim(),
    tts_text: document.getElementById("kq-tts").value.trim(),
    choices: qType === "MCQ" ? validChoices : [],
    correct_choice_id: qType === "MCQ" ? checkedChoiceId : null,
    shuffle_choices: Boolean(document.getElementById("kq-shuffle")?.checked),
    correct_short_answers: qType === "SHORT" ? shortAnswers : [],
    explanation: document.getElementById("kq-explanation").value.trim(),
  };

  const url = editingQuestionId
    ? `/api/v1/modules/korean_exam/questions/${editingQuestionId}`
    : "/api/v1/modules/korean_exam/questions";

  const res = await fetch(url, {
    method: editingQuestionId ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return showMsg(data.detail || "시험 문항 저장 실패", true);
  }

  cancelEditExamQuestion();
  showMsg("시험 문항이 저장되었습니다.");
  await loadBankQuestionsList(currentBankPage);
}

async function deleteExamQuestion(qid) {
  if (!confirm("이 문항을 문제은행에서 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/questions/${qid}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("문항 삭제 실패", true);
  showMsg("문항이 삭제되었습니다.");
  await loadBankQuestionsList(currentBankPage);
}

/* =========================================================
   문항 상세 미리보기 카드 생성 헬퍼 (태그 + 지문 + 미디어 + 보기/정답)
========================================================= */
function _escapePreviewHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _buildQuestionDetailPreviewHtml(q) {
  if (!q) return "";
  const parts = [];

  // 1. 소속 그룹 표시
  const grp = q.exam_question_groups;
  if (grp && grp.title) {
    parts.push(
      `<div style="color:#6b21a8; font-size:11px; font-weight:700; margin-top:4px;">[그룹] ${_escapePreviewHtml(grp.title)}</div>`
    );
  }

  // 2. 태그 배지 목록 표시
  const tags = Array.isArray(q.tags) ? q.tags.filter(Boolean) : [];
  if (tags.length > 0) {
    const tagBadges = tags
      .map(
        t =>
          `<span class="tag" style="background:#e0f2fe; color:#0369a1; font-size:10.5px; padding:1px 6px; margin-right:3px;">#${_escapePreviewHtml(t)}</span>`
      )
      .join("");
    parts.push(`<div style="margin-top:4px; line-height:1.5;">${tagBadges}</div>`);
  }

  // 3. 발문(문제 제목)
  parts.push(
    `<div style="font-weight:700; color:#0f172a; font-size:13px; margin-top:4px;">${_escapePreviewHtml(q.prompt_text || "")}</div>`
  );

  // 4. 개별 지문 텍스트
  if (q.passage_text && q.passage_text.trim()) {
    parts.push(
      `<div style="margin-top:5px; padding:6px 8px; background:#f8fafc; border-left:3px solid #94a3b8; border-radius:4px; font-size:12px; color:#334155; white-space:pre-line; line-height:1.45;">${_escapePreviewHtml(q.passage_text.trim())}</div>`
    );
  }

  // 5. 미디어(이미지/오디오/TTS) 요약 및 썸네일
  const mediaBadges = [];
  if (q.image_url) mediaBadges.push("🖼 이미지 첨부");
  if (q.audio_url) mediaBadges.push("🎧 오디오 파일");
  else if (q.tts_text) mediaBadges.push(`🗣 TTS: "${_escapePreviewHtml(q.tts_text)}"`);

  if (mediaBadges.length) {
    parts.push(
      `<div style="margin-top:4px; font-size:11px; color:#0284c7; font-weight:600;">${mediaBadges.join(" · ")}</div>`
    );
  }
  if (q.image_url) {
    parts.push(
      `<img src="${_escapePreviewHtml(q.image_url)}" style="max-height:70px; max-width:140px; margin-top:4px; border-radius:4px; border:1px solid #cbd5e1;" />`
    );
  }

  // 6. 객관식 보기 (정답 하이라이트) 또는 주관식 인정 정답
  const shortAnswers = q.correct_short_answers || q.correct_answers || [];
  if (q.question_type === "MCQ" && Array.isArray(q.choices) && q.choices.length) {
    const choiceLines = q.choices
      .map((ch, idx) => {
        const isAns = String(ch.id) === String(q.correct_choice_id);
        const labelText = ch.text
          ? _escapePreviewHtml(ch.text)
          : ch.image_url
            ? "(이미지 보기)"
            : ch.audio_url || ch.tts_text
              ? "(음성 보기)"
              : "(빈 보기)";
        return `
          <div style="font-size:11.5px; padding:3px 6px; border-radius:4px; background:${isAns ? "#dcfce7" : "#f1f5f9"}; color:${isAns ? "#166534" : "#475569"}; font-weight:${isAns ? "700" : "400"};">
            ${idx + 1}) ${labelText} ${isAns ? "✔" : ""}
          </div>
        `;
      })
      .join("");
    parts.push(
      `<div style="margin-top:6px; display:grid; grid-template-columns:1fr 1fr; gap:4px;">${choiceLines}</div>`
    );
  } else if (q.question_type === "SHORT" && Array.isArray(shortAnswers) && shortAnswers.length) {
    parts.push(
      `<div style="margin-top:5px; font-size:11.5px; color:#166534; background:#dcfce7; padding:3px 7px; border-radius:4px; display:inline-block;">
        <b>정답:</b> ${_escapePreviewHtml(shortAnswers.join(" / "))}
      </div>`
    );
  }

  return parts.join("");
}

/* =========================================================
   3. 공식 시험지 제작 · 문항 담기 · 배포 관리 (kp-*)
========================================================= */
async function loadPaperPickerQuestions(page = 1) {
  paperPickerPage = page;
  const q = document.getElementById("kp-picker-q")?.value.trim() || "";
  const level = document.getElementById("kp-picker-level")?.value || "";

  const params = new URLSearchParams({ page: String(page), page_size: "15" });
  if (q) params.append("q", q);
  if (level) params.append("level", level);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  const listEl = document.getElementById("kp-picker-list");
  const pagEl = document.getElementById("kp-picker-pagination");
  if (!listEl) return;

  if (!res.ok) {
    listEl.innerHTML = `<p style="color:#b91c1c; font-size:12px;">문항을 불러오지 못했습니다.</p>`;
    return;
  }

  const data = await res.json();
  paperPickerQuestions = data.items || [];
  const selectedIds = new Set(paperSelectedItems.map(item => String(item.question_id)));

  if (!paperPickerQuestions.length) {
    listEl.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:16px;">검색된 문항이 없습니다.</p>`;
    if (pagEl) pagEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = paperPickerQuestions
    .map(item => {
      const isAdded = selectedIds.has(String(item.id));
      return `
        <div style="border:1px solid ${isAdded ? "#86efac" : "#cbd5e1"}; border-radius:6px; padding:9px; margin-bottom:8px; background:${isAdded ? "#f0fdf4" : "#fff"};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div>
                <span class="pos-badge" style="font-size:10.5px;">${item.level} · ${item.category} · ${item.question_type === "MCQ" ? "객관식" : "주관식"}</span>
                <span class="tag" style="font-size:10.5px;">기본 ${item.points || 10}점</span>
              </div>
              ${_buildQuestionDetailPreviewHtml(item)}
            </div>
            <button type="button"
              class="${isAdded ? "secondary" : ""}"
              style="padding:5px 9px; font-size:11.5px; white-space:nowrap; flex-shrink:0;"
              onclick="addQuestionToPaper('${item.id}')"
              ${isAdded ? "disabled" : ""}>
              ${isAdded ? "✓ 담김" : "+ 담기"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(
      data.page || 1,
      data.total_pages || 1,
      "loadPaperPickerQuestions"
    );
  }
}

function addQuestionToPaper(qid) {
  if (paperSelectedItems.some(it => String(it.question_id) === String(qid))) return;
  const found =
    paperPickerQuestions.find(q => String(q.id) === String(qid)) ||
    kexamBankQuestions.find(q => String(q.id) === String(qid));
  if (!found) return;

  paperSelectedItems.push({
    question_id: String(found.id),
    raw_question: found,
    points: found.points || 10,
  });
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function removeQuestionFromPaper(idx) {
  paperSelectedItems.splice(idx, 1);
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function movePaperSelectedItem(idx, dir) {
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= paperSelectedItems.length) return;
  const temp = paperSelectedItems[idx];
  paperSelectedItems[idx] = paperSelectedItems[targetIdx];
  paperSelectedItems[targetIdx] = temp;
  renderPaperSelectedItems();
}

function updatePaperItemPoints(idx, val) {
  const pts = Math.max(1, parseInt(val, 10) || 1);
  if (paperSelectedItems[idx]) {
    paperSelectedItems[idx].points = pts;
  }
  updatePaperTotalBadge();
}

function updatePaperTotalBadge() {
  const totalPts = paperSelectedItems.reduce(
    (acc, cur) => acc + (parseInt(cur.points, 10) || 0),
    0
  );
  const el = document.getElementById("kp-selected-summary");
  if (el) el.textContent = `총 ${paperSelectedItems.length}문항 · ${totalPts}점`;
}

function renderPaperSelectedItems() {
  updatePaperTotalBadge();
  const container = document.getElementById("kp-selected-list");
  if (!container) return;

  if (!paperSelectedItems.length) {
    container.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:30px 10px;">좌측 문제은행에서 <b>[+ 담기]</b> 버튼을 눌러 출제할 문항을 추가하세요.</p>`;
    return;
  }

  container.innerHTML = paperSelectedItems
    .map((item, idx) => {
      const q = item.raw_question || {};
      return `
        <div style="background:#fff; border:1px solid #93c5fd; border-radius:6px; padding:9px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding-bottom:6px; border-bottom:1px dashed #e2e8f0;">
            <div>
              <span class="tag" style="background:#1e293b; color:#fff;">${idx + 1}번</span>
              <span class="pos-badge" style="font-size:10.5px;">${q.level || "-"} · ${q.category || "-"}</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <input type="number" min="1" value="${item.points}" style="width:52px; padding:3px 5px; font-size:12px; text-align:right;" onchange="updatePaperItemPoints(${idx}, this.value)" />
              <span style="font-size:11px;">점</span>
              <button type="button" class="secondary" style="padding:3px 6px; font-size:11px;" onclick="movePaperSelectedItem(${idx}, -1)">▲</button>
              <button type="button" class="secondary" style="padding:3px 6px; font-size:11px;" onclick="movePaperSelectedItem(${idx}, 1)">▼</button>
              <button type="button" class="danger" style="padding:3px 7px; font-size:11px;" onclick="removeQuestionFromPaper(${idx})">✕</button>
            </div>
          </div>
          <div>${_buildQuestionDetailPreviewHtml(q)}</div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   관리자 탭 초기 진입 시 일괄 초기화 헬퍼
========================================================= */
async function initKoreanExamAdminPanels() {
  toggleQuestionTypeFields();
  renderChoicesEditor([], "1");
  renderPaperSelectedItems();
  await Promise.all([
    loadExamGroupsList(),
    loadBankQuestionsList(1),
    loadPaperPickerQuestions(1),
    loadManagedExamPapers(),
  ]);
}