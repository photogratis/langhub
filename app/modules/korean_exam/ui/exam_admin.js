/* =========================================================
   korean_exam/ui/exam_admin.js — 그룹 · 문제은행 문항 · 공식 시험지 CRUD
   ========================================================= */

async function uploadMediaToField(fileInput, targetInputId) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const headers = {};
  const token = localStorage.getItem("access_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  showMsg("미디어 파일을 업로드하는 중입니다...");
  try {
    const res = await fetch("/api/v1/modules/korean_exam/upload-media", {
      method: "POST",
      headers,
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(extractApiErrorMessage(data, "미디어 업로드 실패"), true);
      return;
    }
    const target = document.getElementById(targetInputId);
    if (target) target.value = data.url;
    showMsg(`파일 업로드 완료: ${data.filename}`);
  } catch (err) {
    showMsg(`업로드 네트워크 오류: ${err.message}`, true);
  } finally {
    fileInput.value = "";
  }
}

/* =========================================================
   1. 그룹 지문 관리
   ========================================================= */
async function loadExamGroupsList() {
  const container = document.getElementById("ke-groups-list");
  if (!container) return;

  const res = await fetch("/api/v1/modules/korean_exam/groups", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">그룹 목록을 불러오지 못했습니다.</p>`;
    return;
  }
  kexamGroups = await res.json();

  container.innerHTML = kexamGroups.length
    ? kexamGroups.map(g => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <span class="tag">${g.level}</span>
              <span class="tag">${g.category}</span>
              <span class="tag" style="background:#f3e8ff; color:#6b21a8;">${g.sample_count > 0 ? `랜덤 ${g.sample_count}문항 추출` : "전체 출제"}</span>
              <strong style="margin-left:6px;">${g.title}</strong>
              <div style="font-size:13px; color:#334155; margin-top:4px;">지시문: ${g.instruction}</div>
              ${g.passage_text ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">지문: ${g.passage_text.slice(0, 90)}${g.passage_text.length > 90 ? "..." : ""}</div>` : ""}
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="editQuestionGroup('${g.id}')">수정</button>
              <button type="button" class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteQuestionGroup('${g.id}')">삭제</button>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:16px;">등록된 문제 그룹이 없습니다.</p>`;
}

async function loadExamGroupsForSelect() {
  const sel = document.getElementById("keq-group-id");
  if (!sel) return;
  const res = await fetch("/api/v1/modules/korean_exam/groups", { headers: getAuthHeaders(false) });
  if (!res.ok) return;
  kexamGroups = await res.json();
  const prev = sel.value;
  sel.innerHTML = `<option value="">단독 문항 (그룹 없음)</option>` +
    kexamGroups.map(g => `<option value="${g.id}">[${g.level}/${g.category}] ${g.title}</option>`).join("");
  if (prev) sel.value = prev;
}

async function submitQuestionGroup(event) {
  event.preventDefault();
  const payload = {
    title: document.getElementById("keg-title").value.trim(),
    level: document.getElementById("keg-level").value,
    category: document.getElementById("keg-category").value,
    sample_count: parseInt(document.getElementById("keg-sample").value || "0", 10),
    instruction: document.getElementById("keg-instruction").value.trim(),
    passage_text: document.getElementById("keg-passage").value.trim(),
    image_url: document.getElementById("keg-img").value.trim(),
    audio_url: document.getElementById("keg-audio").value.trim(),
    tts_text: document.getElementById("keg-tts").value.trim(),
    tags: []
  };

  const url = editingGroupId
    ? `/api/v1/modules/korean_exam/groups/${editingGroupId}`
    : "/api/v1/modules/korean_exam/groups";
  const method = editingGroupId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "그룹 저장 실패"), true);

  showMsg(editingGroupId ? "문제 그룹이 수정되었습니다." : "새 문제 그룹이 등록되었습니다.");
  cancelEditQuestionGroup();
  await loadExamGroupsList();
}

function editQuestionGroup(groupId) {
  const g = kexamGroups.find(item => String(item.id) === String(groupId));
  if (!g) return;
  editingGroupId = g.id;
  document.getElementById("ke-gform-title").textContent = "[문제은행] 문제 그룹 수정 중";
  document.getElementById("keg-title").value = g.title || "";
  document.getElementById("keg-level").value = g.level || "초급";
  document.getElementById("keg-category").value = g.category || "듣기";
  document.getElementById("keg-sample").value = g.sample_count || 0;
  document.getElementById("keg-instruction").value = g.instruction || "";
  document.getElementById("keg-passage").value = g.passage_text || "";
  document.getElementById("keg-img").value = g.image_url || "";
  document.getElementById("keg-audio").value = g.audio_url || "";
  document.getElementById("keg-tts").value = g.tts_text || "";
  document.getElementById("keg-submit-btn").textContent = "그룹 수정 저장";
  document.getElementById("keg-cancel-btn").classList.remove("hidden");
  document.getElementById("ke-g-form").scrollIntoView({ behavior: "smooth" });
}

function cancelEditQuestionGroup() {
  editingGroupId = null;
  document.getElementById("ke-gform-title").textContent = "[문제은행] 새 문제 그룹(공통 지문/지시문) 등록";
  document.getElementById("ke-g-form")?.reset();
  document.getElementById("keg-submit-btn").textContent = "그룹 저장하기";
  document.getElementById("keg-cancel-btn").classList.add("hidden");
}

async function deleteQuestionGroup(groupId) {
  if (!confirm("이 그룹과 소속된 문항을 모두 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/groups/${groupId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("그룹 삭제 실패", true);
  showMsg("그룹이 삭제되었습니다.");
  loadExamGroupsList();
}

/* =========================================================
   2. 문제은행 문항 등록 및 관리
   ========================================================= */
function renderChoicesEditor(choicesData = null) {
  const container = document.getElementById("keq-choices-editor");
  if (!container) return;

  const defaults = [
    { id: "c1", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c2", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c3", text: "", image_url: "", audio_url: "", tts_text: "" },
    { id: "c4", text: "", image_url: "", audio_url: "", tts_text: "" }
  ];
  const list = (choicesData && choicesData.length === 4) ? choicesData : defaults;

  container.innerHTML = list.map((c, idx) => {
    const cid = `c${idx + 1}`;
    return `
      <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:6px; background:#f8fafc;">
        <div class="row" style="margin-bottom:4px;">
          <div style="flex:2;">
            <label style="font-size:11px;">${idx + 1}번 보기 텍스트</label>
            <input type="text" id="keq-${cid}-text" value="${(c.text || "").replace(/"/g, "&quot;")}" placeholder="${idx + 1}번 보기 내용" />
          </div>
          <div style="flex:1.5;">
            <label style="font-size:11px;">보기 TTS 텍스트 (선택)</label>
            <input type="text" id="keq-${cid}-tts" value="${(c.tts_text || "").replace(/"/g, "&quot;")}" placeholder="읽어주기 문장" />
          </div>
        </div>
        <div class="row">
          <div>
            <label style="font-size:11px;">보기 이미지 URL / 업로드</label>
            <div style="display:flex; gap:4px;">
              <input type="text" id="keq-${cid}-img" value="${c.image_url || ""}" placeholder="https://..." />
              <input type="file" accept="image/*" style="width:85px; padding:3px;" onchange="uploadMediaToField(this, 'keq-${cid}-img')" />
            </div>
          </div>
          <div>
            <label style="font-size:11px;">보기 오디오 URL / 업로드</label>
            <div style="display:flex; gap:4px;">
              <input type="text" id="keq-${cid}-audio" value="${c.audio_url || ""}" placeholder="https://..." />
              <input type="file" accept="audio/*" style="width:85px; padding:3px;" onchange="uploadMediaToField(this, 'keq-${cid}-audio')" />
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

function toggleQuestionTypeFields() {
  const qType = document.getElementById("keq-type")?.value || "MCQ";
  document.getElementById("keq-mcq-box")?.classList.toggle("hidden", qType !== "MCQ");
  document.getElementById("keq-short-box")?.classList.toggle("hidden", qType !== "SHORT");
}

async function submitBankQuestion(event) {
  event.preventDefault();
  const qType = document.getElementById("keq-type").value;
  const choices = [];
  if (qType === "MCQ") {
    for (let i = 1; i <= 4; i++) {
      const cid = `c${i}`;
      choices.push({
        id: cid,
        text: document.getElementById(`keq-${cid}-text`)?.value.trim() || "",
        image_url: document.getElementById(`keq-${cid}-img`)?.value.trim() || "",
        audio_url: document.getElementById(`keq-${cid}-audio`)?.value.trim() || "",
        tts_text: document.getElementById(`keq-${cid}-tts`)?.value.trim() || ""
      });
    }
  }

  const rawShort = document.getElementById("keq-short-answers")?.value || "";
  const rawTags = document.getElementById("keq-tags")?.value || "";

  const payload = {
    group_id: document.getElementById("keq-group-id").value || null,
    order_in_group: parseInt(document.getElementById("keq-order").value || "1", 10),
    question_type: qType,
    level: document.getElementById("keq-level").value,
    category: document.getElementById("keq-category").value,
    points: parseInt(document.getElementById("keq-points").value || "10", 10),
    prompt_text: document.getElementById("keq-prompt").value.trim(),
    passage_text: document.getElementById("keq-passage").value.trim(),
    image_url: document.getElementById("keq-img").value.trim(),
    audio_url: document.getElementById("keq-audio").value.trim(),
    tts_text: document.getElementById("keq-tts").value.trim(),
    shuffle_choices: Boolean(document.getElementById("keq-shuffle")?.checked),
    choices,
    correct_choice_id: qType === "MCQ" ? document.getElementById("keq-correct-cid").value : "",
    correct_answers: qType === "SHORT" ? rawShort.split(",").map(s => s.trim()).filter(Boolean) : [],
    explanation: document.getElementById("keq-exp").value.trim(),
    tags: rawTags.split(",").map(s => s.trim()).filter(Boolean)
  };

  const url = editingQuestionId
    ? `/api/v1/modules/korean_exam/questions/${editingQuestionId}`
    : "/api/v1/modules/korean_exam/questions";
  const method = editingQuestionId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "문항 저장 실패"), true);

  showMsg(editingQuestionId ? "문항이 수정되었습니다." : "새 문항이 문제은행에 등록되었습니다.");
  cancelEditBankQuestion();
  await loadBankQuestionsList(currentBankPage);
}

async function loadBankQuestionsList(page = 1) {
  currentBankPage = page;
  const container = document.getElementById("keq-bank-list");
  if (!container) return;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", document.getElementById("keq-bank-page-size")?.value || "15");
  const q = document.getElementById("keq-search-q")?.value.trim();
  const level = document.getElementById("keq-search-level")?.value;
  const cat = document.getElementById("keq-search-cat")?.value;
  const qtype = document.getElementById("keq-search-type")?.value;
  const tag = document.getElementById("keq-search-tag")?.value.trim();

  if (q) params.set("q", q);
  if (level) params.set("level", level);
  if (cat) params.set("category", cat);
  if (qtype) params.set("question_type", qtype);
  if (tag) params.set("tag", tag);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">문항 목록을 불러오지 못했습니다.</p>`;
    return;
  }
  const data = await res.json();
  kexamBankQuestions = data.items || [];

  const totalEl = document.getElementById("keq-bank-total");
  if (totalEl) totalEl.textContent = `전체 ${data.total || 0}문항 (${data.page}/${data.total_pages} 페이지)`;

  container.innerHTML = kexamBankQuestions.length
    ? kexamBankQuestions.map(item => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div>
              <span class="tag">${item.level}</span>
              <span class="tag">${item.category}</span>
              <span class="tag" style="background:#e0f2fe; color:#0369a1;">${item.question_type === "MCQ" ? "객관식" : "주관식"} · ${item.points}점</span>
              ${item.exam_question_groups ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8;">그룹: ${item.exam_question_groups.title}</span>` : ""}
              <div style="font-weight:700; margin-top:6px;">${item.prompt_text}</div>
              ${item.passage_text ? `<div style="font-size:12px; color:#64748b; margin-top:3px;">지문: ${item.passage_text.slice(0, 100)}</div>` : ""}
            </div>
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button type="button" class="secondary" style="padding:4px 8px; font-size:12px;" onclick="editBankQuestion('${item.id}')">수정</button>
              <button type="button" class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteBankQuestion('${item.id}')">삭제</button>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:20px;">등록된 문항이 없습니다.</p>`;

  const pagEl = document.getElementById("keq-bank-pagination");
  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(data.page, data.total_pages, "loadBankQuestionsList");
  }
}

function editBankQuestion(questionId) {
  const item = kexamBankQuestions.find(q => String(q.id) === String(questionId));
  if (!item) return;
  editingQuestionId = item.id;
  document.getElementById("ke-qform-title").textContent = "[문제은행] 문항 수정 중";
  document.getElementById("keq-group-id").value = item.group_id || "";
  document.getElementById("keq-order").value = item.order_in_group || 1;
  document.getElementById("keq-type").value = item.question_type || "MCQ";
  toggleQuestionTypeFields();
  document.getElementById("keq-level").value = item.level || "초급";
  document.getElementById("keq-category").value = item.category || "읽기";
  document.getElementById("keq-points").value = item.points || 10;
  document.getElementById("keq-prompt").value = item.prompt_text || "";
  document.getElementById("keq-passage").value = item.passage_text || "";
  document.getElementById("keq-img").value = item.image_url || "";
  document.getElementById("keq-audio").value = item.audio_url || "";
  document.getElementById("keq-tts").value = item.tts_text || "";
  document.getElementById("keq-shuffle").checked = item.shuffle_choices !== false;
  renderChoicesEditor(item.choices);
  if (item.correct_choice_id) document.getElementById("keq-correct-cid").value = item.correct_choice_id;
  document.getElementById("keq-short-answers").value = (item.correct_answers || []).join(", ");
  document.getElementById("keq-exp").value = item.explanation || "";
  document.getElementById("keq-tags").value = (item.tags || []).join(", ");
  document.getElementById("keq-submit-btn").textContent = "문항 수정 저장";
  document.getElementById("keq-cancel-btn").classList.remove("hidden");
  document.getElementById("ke-q-form").scrollIntoView({ behavior: "smooth" });
}

function cancelEditBankQuestion() {
  editingQuestionId = null;
  document.getElementById("ke-qform-title").textContent = "[문제은행] 새 시험 문항 등록";
  document.getElementById("ke-q-form")?.reset();
  toggleQuestionTypeFields();
  renderChoicesEditor();
  document.getElementById("keq-submit-btn").textContent = "문항 저장하기";
  document.getElementById("keq-cancel-btn").classList.add("hidden");
}

async function deleteBankQuestion(questionId) {
  if (!confirm("이 문항을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/questions/${questionId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("문항 삭제 실패", true);
  showMsg("문항이 삭제되었습니다.");
  loadBankQuestionsList(currentBankPage);
}

/* =========================================================
   3. 시험지 제작 및 배포 관리
   ========================================================= */
async function loadPaperPickerQuestions(page = 1) {
  paperPickerPage = page;
  const container = document.getElementById("kep-picker-list");
  if (!container) return;

  const params = new URLSearchParams({ page: String(page), page_size: "10" });
  const q = document.getElementById("kep-picker-q")?.value.trim();
  const level = document.getElementById("kep-picker-level")?.value;
  const cat = document.getElementById("kep-picker-cat")?.value;
  const qtype = document.getElementById("kep-picker-type")?.value;
  if (q) params.set("q", q);
  if (level) params.set("level", level);
  if (cat) params.set("category", cat);
  if (qtype) params.set("question_type", qtype);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return;
  const data = await res.json();
  paperPickerQuestions = data.items || [];

  const sumEl = document.getElementById("kep-picker-summary");
  if (sumEl) sumEl.textContent = `검색 결과: ${data.total || 0}문항`;

  container.innerHTML = paperPickerQuestions.length
    ? paperPickerQuestions.map(item => {
        const added = paperSelectedItems.some(s => String(s.question_id) === String(item.id));
        return `
          <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin-bottom:6px; background:${added ? "#f0fdf4" : "#fff"};">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
              <div style="font-size:12.5px;">
                <span class="tag">${item.level}</span>
                <span class="tag">${item.category}</span>
                <strong>${item.prompt_text}</strong>
              </div>
              <button type="button" style="padding:4px 8px; font-size:11px; flex-shrink:0;" ${added ? "disabled" : ""} onclick="addQuestionToPaper('${item.id}')">
                ${added ? "담김" : "+ 담기"}
              </button>
            </div>
          </div>`;
      }).join("")
    : `<p style="color:#64748b; font-size:12px; text-align:center; padding:12px;">검색된 문항이 없습니다.</p>`;

  const pagEl = document.getElementById("kep-picker-pagination");
  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(data.page, data.total_pages, "loadPaperPickerQuestions");
  }
}

function addQuestionToPaper(questionId) {
  const q = paperPickerQuestions.find(item => String(item.id) === String(questionId));
  if (!q) return;
  if (paperSelectedItems.some(s => String(s.question_id) === String(questionId))) return;

  paperSelectedItems.push({
    question_id: String(q.id),
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
  const pts = Math.max(1, parseInt(val || "1", 10));
  if (paperSelectedItems[idx]) paperSelectedItems[idx].points = pts;
  updatePaperTotalBadge();
}

function updatePaperTotalBadge() {
  const totalPts = paperSelectedItems.reduce((acc, it) => acc + (it.points || 0), 0);
  const badge = document.getElementById("kep-total-badge");
  if (badge) badge.textContent = `${paperSelectedItems.length}문항 · 총 ${totalPts}점`;
}

function renderPaperSelectedItems() {
  const container = document.getElementById("kep-selected-list");
  if (!container) return;
  updatePaperTotalBadge();

  container.innerHTML = paperSelectedItems.length
    ? paperSelectedItems.map((it, idx) => `
        <div style="background:#fff; border:1px solid #bfdbfe; border-radius:6px; padding:8px; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:6px;">
          <div style="font-size:12.5px;">
            <b>${idx + 1}.</b> <span class="tag">${it.level}/${it.category}</span> ${it.prompt_text}
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <input type="number" value="${it.points}" min="1" style="width:55px; padding:3px 5px; font-size:12px;" onchange="updatePaperItemPoints(${idx}, this.value)" />
            <span style="font-size:11px;">점</span>
            <button type="button" class="danger" style="padding:3px 6px; font-size:11px;" onclick="removeQuestionFromPaper(${idx})">✕</button>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; font-size:12.5px; text-align:center; padding:24px;">좌측 문제은행에서 출제할 문항을 담아주세요.</p>`;
}

async function submitExamPaperForm() {
  const title = document.getElementById("kep-title")?.value.trim();
  if (!title) return showMsg("시험지 제목을 입력해 주세요.", true);
  if (!paperSelectedItems.length) return showMsg("최소 1개 이상의 문항을 시험지에 담아주세요.", true);

  const payload = {
    title,
    description: document.getElementById("kep-desc")?.value.trim() || "",
    level: document.getElementById("kep-level")?.value || "혼합",
    category: document.getElementById("kep-category")?.value || "종합",
    time_limit_seconds: parseInt(document.getElementById("kep-mins")?.value || "15", 10) * 60,
    is_published: document.getElementById("kep-published")?.value === "true",
    items: paperSelectedItems.map((it, idx) => ({
      question_id: it.question_id,
      points: it.points,
      order_no: idx + 1
    }))
  };

  const url = editingPaperId
    ? `/api/v1/modules/korean_exam/papers/${editingPaperId}`
    : "/api/v1/modules/korean_exam/papers";
  const method = editingPaperId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(extractApiErrorMessage(data, "시험지 저장 실패"), true);

  showMsg(editingPaperId ? "시험지가 수정되었습니다." : "새 시험지가 저장 및 배포되었습니다.");
  cancelEditExamPaper();
  await loadManagedExamPapers();
}

function cancelEditExamPaper() {
  editingPaperId = null;
  paperSelectedItems = [];
  document.getElementById("kep-form-title").textContent = "[선생님/관리자] 새 시험지 제작 및 문항·배점 구성";
  document.getElementById("kep-title").value = "";
  document.getElementById("kep-desc").value = "";
  document.getElementById("kep-submit-btn").textContent = "시험지 저장 및 배포하기";
  document.getElementById("kep-cancel-btn").classList.add("hidden");
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

async function loadManagedExamPapers() {
  const container = document.getElementById("kep-managed-papers-list");
  if (!container) return;

  const res = await fetch("/api/v1/modules/korean_exam/papers?include_unpublished=true", {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return;
  managedPapersCache = await res.json();

  container.innerHTML = managedPapersCache.length
    ? managedPapersCache.map(p => `
        <div class="word-card" style="background:#fff; border:1px solid #cbd5e1; margin-bottom:10px; padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <span class="tag" style="${p.is_published ? "background:#dcfce7; color:#166534;" : "background:#f1f5f9; color:#475569;"}">${p.is_published ? "공개 중" : "비공개"}</span>
              <span class="tag">${p.level} · ${p.category}</span>
              <strong style="margin-left:4px;">${p.title}</strong>
              <span style="font-size:12px; color:#64748b; margin-left:6px;">(${(p.items || []).length}문항 · 총 ${p.total_points}점 · ${Math.round((p.time_limit_seconds || 600) / 60)}분)</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" style="background:#2563eb; padding:4px 10px; font-size:12px;" onclick="openExamShareModal('${p.id}', '${(p.title || "").replace(/'/g, "\\'")}')">링크·QR</button>
              <button type="button" class="danger" style="padding:4px 8px; font-size:12px;" onclick="deleteManagedExamPaper('${p.id}')">삭제</button>
            </div>
          </div>
        </div>`).join("")
    : `<p style="color:#64748b; text-align:center; padding:16px;">제작된 시험지가 없습니다.</p>`;
}

async function deleteManagedExamPaper(paperId) {
  if (!confirm("이 시험지를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/papers/${paperId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("시험지 삭제 실패", true);
  showMsg("시험지가 삭제되었습니다.");
  loadManagedExamPapers();
}