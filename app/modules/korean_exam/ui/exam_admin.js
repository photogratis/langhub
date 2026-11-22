/* =========================================================
   korean_exam/ui/exam_admin.js — 시험지 제작, 문제은행, 그룹 지문 관리
   ========================================================= */

function _buildQuestionDetailPreviewHtml(q) {
  if (!q) return "";
  const parts = [];

  const grp = q.exam_question_groups;
  if (grp && grp.title) {
    parts.push(`<div style="color:#6b21a8; font-size:11px; font-weight:700; margin-top:3px;">[그룹] ${grp.title}</div>`);
  }

  parts.push(`<div style="font-weight:700; color:#0f172a; font-size:13px; margin-top:3px;">${q.prompt_text || ""}</div>`);

  if (q.passage_text && q.passage_text.trim()) {
    parts.push(`
      <div style="margin-top:5px; padding:6px 8px; background:#f8fafc; border-left:3px solid #94a3b8; border-radius:4px; font-size:12px; color:#334155; white-space:pre-line; line-height:1.45;">${q.passage_text.trim()}</div>
    `);
  }

  const mediaBadges = [];
  if (q.image_url) mediaBadges.push(`🖼 이미지 첨부`);
  if (q.audio_url) mediaBadges.push(`🎧 오디오 파일`);
  else if (q.tts_text) mediaBadges.push(`🗣 TTS: "${q.tts_text}"`);

  if (mediaBadges.length) {
    parts.push(`<div style="margin-top:4px; font-size:11px; color:#0284c7; font-weight:600;">${mediaBadges.join(" · ")}</div>`);
  }
  if (q.image_url) {
    parts.push(`<img src="${q.image_url}" style="max-height:70px; max-width:140px; margin-top:4px; border-radius:4px; border:1px solid #cbd5e1;" />`);
  }

  if (q.question_type === "MCQ" && Array.isArray(q.choices) && q.choices.length) {
    const choiceLines = q.choices.map((ch, idx) => {
      const isAns = ch.id === q.correct_choice_id;
      const labelText = ch.text || (ch.image_url ? "(이미지 보기)" : (ch.audio_url || ch.tts_text ? "(음성 보기)" : "(빈 보기)"));
      return `
        <div style="font-size:11.5px; padding:2px 6px; border-radius:4px; margin-top:2px; background:${isAns ? "#dcfce7" : "#f1f5f9"}; color:${isAns ? "#166534" : "#475569"}; font-weight:${isAns ? "700" : "400"};">
          ${idx + 1}) ${labelText} ${isAns ? "✔(정답)" : ""}
        </div>
      `;
    }).join("");
    parts.push(`<div style="margin-top:5px; display:grid; grid-template-columns:1fr 1fr; gap:3px;">${choiceLines}</div>`);
  } else if (q.question_type === "SHORT" && Array.isArray(q.correct_answers) && q.correct_answers.length) {
    parts.push(`
      <div style="margin-top:5px; font-size:11.5px; color:#166534; background:#dcfce7; padding:3px 7px; border-radius:4px; display:inline-block;">
        <b>정답:</b> ${q.correct_answers.join(" / ")}
      </div>
    `);
  }

  return parts.join("");
}

async function loadPaperPickerQuestions(page = 1) {
  paperPickerPage = page;
  const q = document.getElementById("kep-picker-q").value;
  const level = document.getElementById("kep-picker-level").value;
  const category = document.getElementById("kep-picker-cat").value;
  const qType = document.getElementById("kep-picker-type").value;

  const params = new URLSearchParams({ page: String(page), page_size: "10" });
  if (q) params.append("q", q);
  if (level) params.append("level", level);
  if (category) params.append("category", category);
  if (qType) params.append("question_type", qType);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showMsg(err.detail || "문제은행 문항을 불러올 수 없습니다. 등급 권한을 확인하세요.", true);
    return;
  }

  const data = await res.json();
  paperPickerQuestions = data.items || [];
  document.getElementById("kep-picker-summary").textContent = `검색 결과: 총 ${data.total}문항 (${data.page}/${data.total_pages} 페이지)`;

  const selectedIds = new Set(paperSelectedItems.map(item => item.question_id));
  const listEl = document.getElementById("kep-picker-list");

  if (!paperPickerQuestions.length) {
    listEl.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:16px;">검색된 문항이 없습니다.</p>`;
  } else {
    listEl.innerHTML = paperPickerQuestions.map(item => {
      const isAdded = selectedIds.has(String(item.id));
      return `
        <div style="border:1px solid #cbd5e1; border-radius:6px; padding:10px; margin-bottom:8px; background:${isAdded ? "#f0fdf4" : "#fff"};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
            <div style="flex:1; min-width:0;">
              <div>
                <span class="pos-badge">${item.level} · ${item.category} · ${item.question_type === "MCQ" ? "객관식" : "주관식"}</span>
                <span class="tag">기본 ${item.points || 10}점</span>
              </div>
              ${_buildQuestionDetailPreviewHtml(item)}
            </div>
            <button
              type="button"
              style="padding:5px 10px; font-size:11.5px; flex-shrink:0; background:${isAdded ? "#16a34a" : "#2563eb"};"
              onclick="addQuestionToPaperBuilder('${item.id}')"
              ${isAdded ? "disabled" : ""}
            >
              ${isAdded ? "담김 ✔" : "+ 담기"}
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("kep-picker-pagination").innerHTML = renderPaginationBar(
    data.page,
    data.total_pages,
    "loadPaperPickerQuestions"
  );
}

function addQuestionToPaperBuilder(qid) {
  if (paperSelectedItems.some(x => x.question_id === String(qid))) return;
  const qObj = paperPickerQuestions.find(x => String(x.id) === String(qid))
    || kexamBankQuestions.find(x => String(x.id) === String(qid));
  if (!qObj) return;

  paperSelectedItems.push({
    question_id: String(qObj.id),
    raw_question: qObj,
    points: qObj.points || 10
  });

  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function removeQuestionFromPaperBuilder(idx) {
  paperSelectedItems.splice(idx, 1);
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);
}

function movePaperSelectedItem(idx, delta) {
  const targetIdx = idx + delta;
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
  const totalPts = paperSelectedItems.reduce((acc, cur) => acc + (parseInt(cur.points, 10) || 0), 0);
  document.getElementById("kep-total-badge").textContent = `${paperSelectedItems.length}문항 · 총 ${totalPts}점`;
}

function renderPaperSelectedItems() {
  updatePaperTotalBadge();
  const container = document.getElementById("kep-selected-list");
  if (!paperSelectedItems.length) {
    container.innerHTML = `<p style="color:#64748b; font-size:12px; text-align:center; padding:30px 10px;">좌측 문제은행에서 <b>[+ 담기]</b> 버튼을 눌러 출제할 문항을 추가하세요.</p>`;
    return;
  }

  container.innerHTML = paperSelectedItems.map((item, idx) => {
    const q = item.raw_question || {};
    return `
      <div style="background:#fff; border:1px solid #93c5fd; border-radius:6px; padding:10px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; padding-bottom:6px; border-bottom:1px dashed #e2e8f0;">
          <div>
            <span class="tag" style="background:#1e293b; color:#fff;">${idx + 1}번</span>
            <span class="pos-badge">${q.level || "-"} · ${q.category || "-"} · ${q.question_type === "MCQ" ? "객관식" : "주관식"}</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <label style="margin:0; font-size:11px;">배점:</label>
            <input
              type="number"
              value="${item.points}"
              min="1"
              max="100"
              style="width:56px; padding:3px 5px; font-size:12px; text-align:right;"
              onchange="updatePaperItemPoints(${idx}, this.value)"
            />
            <button type="button" class="secondary" style="padding:3px 6px; font-size:11px;" onclick="movePaperSelectedItem(${idx}, -1)">▲</button>
            <button type="button" class="secondary" style="padding:3px 6px; font-size:11px;" onclick="movePaperSelectedItem(${idx}, 1)">▼</button>
            <button type="button" class="danger" style="padding:3px 6px; font-size:11px;" onclick="removeQuestionFromPaperBuilder(${idx})">✕</button>
          </div>
        </div>
        <div style="margin-top:4px;">
          ${_buildQuestionDetailPreviewHtml(q)}
        </div>
      </div>
    `;
  }).join("");
}

async function submitExamPaperForm() {
  const title = document.getElementById("kep-title").value.trim();
  if (!title) return showMsg("시험지 제목을 입력해 주세요.", true);
  if (!paperSelectedItems.length) return showMsg("최소 1개 이상의 문항을 담아주세요.", true);

  const body = {
    title,
    description: document.getElementById("kep-desc").value.trim(),
    level: document.getElementById("kep-level").value,
    category: document.getElementById("kep-category").value,
    time_limit_seconds: (parseInt(document.getElementById("kep-mins").value, 10) || 15) * 60,
    is_published: document.getElementById("kep-published").value === "true",
    items: paperSelectedItems.map((item, idx) => ({
      question_id: item.question_id,
      points: parseInt(item.points, 10) || 10,
      order_no: idx + 1
    }))
  };

  const url = editingPaperId
    ? `/api/v1/modules/korean_exam/papers/${editingPaperId}`
    : "/api/v1/modules/korean_exam/papers";
  const res = await fetch(url, {
    method: editingPaperId ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "시험지 저장 실패", true);

  cancelEditExamPaper();
  showMsg("시험지가 저장되었습니다!");
  loadManagedExamPapers();
}

async function loadManagedExamPapers() {
  const res = await fetch("/api/v1/modules/korean_exam/papers?include_unpublished=true", {
    headers: getAuthHeaders(false)
  });
  managedPapersCache = res.ok ? await res.json() : [];
  const container = document.getElementById("kep-managed-papers-list");
  if (!managedPapersCache.length) {
    container.innerHTML = `<p style="color:#64748b;">아직 제작된 시험지가 없습니다.</p>`;
    return;
  }

  container.innerHTML = managedPapersCache.map(p => `
    <div class="word-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <span class="tag" style="background:${p.is_published ? "#dcfce7; color:#166534" : "#f1f5f9; color:#475569"};">
            ${p.is_published ? "공개 중" : "비공개"}
          </span>
          <span class="pos-badge">${p.level} · ${p.category}</span>
          <strong style="margin-left:6px; font-size:16px;">${p.title}</strong>
          <div style="font-size:12px; color:#64748b; margin-top:4px;">
            구성: ${(p.items || []).length}문항 · 총점: ${p.total_points}점 · 시간: ${Math.round((p.time_limit_seconds || 600) / 60)}분 · 출제자: ${p.creator_name || "-"}
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button type="button" style="padding:4px 9px; font-size:12px; background:#0284c7;" onclick="openExamShareModal('${p.id}', ${JSON.stringify(p.title)})">🔗 링크·QR 배포</button>
          <button type="button" style="padding:4px 9px; font-size:12px;" onclick="startEditExamPaper('${p.id}')">수정</button>
          <button type="button" class="danger" onclick="deleteExamPaperRecord('${p.id}')">삭제</button>
        </div>
      </div>
    </div>
  `).join("");
}

async function startEditExamPaper(paperId) {
  const p = managedPapersCache.find(item => item.id === paperId);
  if (!p) return;

  editingPaperId = paperId;
  document.getElementById("kep-title").value = p.title;
  document.getElementById("kep-desc").value = p.description || "";
  document.getElementById("kep-level").value = p.level || "혼합";
  document.getElementById("kep-category").value = p.category || "종합";
  document.getElementById("kep-mins").value = Math.max(1, Math.round((p.time_limit_seconds || 600) / 60));
  document.getElementById("kep-published").value = p.is_published ? "true" : "false";

  const res = await fetch("/api/v1/modules/korean_exam/questions?page=1&page_size=200", {
    headers: getAuthHeaders(false)
  });
  const qData = res.ok ? await res.json() : { items: [] };
  const qMap = new Map((qData.items || []).map(q => [String(q.id), q]));

  paperSelectedItems = (p.items || [])
    .sort((a, b) => (a.order_no || 1) - (b.order_no || 1))
    .map(it => {
      const found = qMap.get(String(it.question_id)) || {
        id: String(it.question_id),
        prompt_text: "(삭제된 문항)",
        level: "-",
        category: "-",
        question_type: "MCQ"
      };
      return {
        question_id: String(it.question_id),
        raw_question: found,
        points: it.points || 10
      };
    });

  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);

  document.getElementById("kep-form-title").textContent = "[선생님/관리자] 시험지 수정 중";
  document.getElementById("kep-submit-btn").textContent = "시험지 수정 내용 저장";
  document.getElementById("kep-cancel-btn").classList.remove("hidden");
  document.getElementById("kexam-sec-papers").scrollIntoView({ behavior: "smooth" });
}

function cancelEditExamPaper() {
  editingPaperId = null;
  paperSelectedItems = [];
  document.getElementById("kep-title").value = "";
  document.getElementById("kep-desc").value = "";
  document.getElementById("kep-mins").value = "15";
  document.getElementById("kep-published").value = "true";
  renderPaperSelectedItems();
  loadPaperPickerQuestions(paperPickerPage);

  document.getElementById("kep-form-title").textContent = "[선생님/관리자] 새 시험지 제작 및 문항·배점 구성";
  document.getElementById("kep-submit-btn").textContent = "시험지 저장 및 배포하기";
  document.getElementById("kep-cancel-btn").classList.add("hidden");
}

async function deleteExamPaperRecord(paperId) {
  if (!confirm("이 시험지를 삭제하시겠습니까?")) return;
  await fetch(`/api/v1/modules/korean_exam/papers/${paperId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  showMsg("시험지가 삭제되었습니다.");
  loadManagedExamPapers();
}

async function uploadMediaToField(fileInput, targetTextInputId) {
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const token = localStorage.getItem("access_token");
  const res = await fetch("/api/v1/modules/korean_exam/upload-media", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "파일 업로드 실패", true);

  document.getElementById(targetTextInputId).value = data.url;
  showMsg(`파일 업로드 완료: ${data.filename}`);
}

function renderChoicesEditor(choices = []) {
  const container = document.getElementById("keq-choices-editor");
  if (!container) return;
  const slots = ["c1", "c2", "c3", "c4"];
  container.innerHTML = slots.map((cid, idx) => {
    const existing = choices.find(c => c.id === cid) || {};
    return `
      <div class="row" style="margin-bottom:6px; padding-bottom:6px; border-bottom:1px dashed #e2e8f0;">
        <div style="flex:1.5;">
          <label>${idx + 1}번 보기 텍스트</label>
          <input type="text" id="keq-ch-text-${cid}" value="${(existing.text || "").replace(/"/g, "&quot;")}" placeholder="${idx + 1}번 선택지 내용" />
        </div>
        <div style="flex:1;">
          <label>보기 이미지 URL/업로드</label>
          <div style="display:flex; gap:3px;">
            <input type="text" id="keq-ch-img-${cid}" value="${existing.image_url || ""}" placeholder="이미지 URL" />
            <input type="file" accept="image/*" style="width:75px; padding:3px;" onchange="uploadMediaToField(this, 'keq-ch-img-${cid}')" />
          </div>
        </div>
        <div style="flex:1;">
          <label>보기 오디오 URL/업로드</label>
          <div style="display:flex; gap:3px;">
            <input type="text" id="keq-ch-aud-${cid}" value="${existing.audio_url || ""}" placeholder="오디오 URL" />
            <input type="file" accept="audio/*" style="width:75px; padding:3px;" onchange="uploadMediaToField(this, 'keq-ch-aud-${cid}')" />
          </div>
        </div>
        <div style="flex:1;">
          <label>보기 TTS 텍스트</label>
          <input type="text" id="keq-ch-tts-${cid}" value="${(existing.tts_text || "").replace(/"/g, "&quot;")}" placeholder="읽어줄 텍스트" />
        </div>
      </div>
    `;
  }).join("");
}

function toggleQuestionTypeFields() {
  const qType = document.getElementById("keq-type").value;
  document.getElementById("keq-mcq-box").classList.toggle("hidden", qType !== "MCQ");
  document.getElementById("keq-short-box").classList.toggle("hidden", qType !== "SHORT");
}

async function loadExamGroupsForSelect() {
  const res = await fetch("/api/v1/modules/korean_exam/groups", { headers: getAuthHeaders(false) });
  kexamGroups = res.ok ? await res.json() : [];
  const sel = document.getElementById("keq-group-id");
  if (sel) {
    sel.innerHTML = `<option value="">단독 문항 (그룹 없음)</option>` +
      kexamGroups.map(g => `<option value="${g.id}">[${g.level}/${g.category}] ${g.title}</option>`).join("");
  }
}

async function loadExamGroupsList() {
  await loadExamGroupsForSelect();
  const container = document.getElementById("ke-groups-list");
  if (!kexamGroups.length) {
    container.innerHTML = `<p style="color:#64748b;">등록된 문제 그룹이 없습니다.</p>`;
    return;
  }
  container.innerHTML = kexamGroups.map(g => `
    <div class="word-card" style="background:#faf5ff;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="pos-badge">${g.level} · ${g.category}</span>
          <strong style="margin-left:6px;">${g.title}</strong>
          <span class="tag" style="margin-left:6px;">${g.sample_count > 0 ? `그룹 내 ${g.sample_count}문항 랜덤 추출` : "그룹 전체 출제"}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button style="padding:4px 9px; font-size:12px;" onclick="startEditQuestionGroup('${g.id}')">수정</button>
          <button class="danger" onclick="deleteQuestionGroup('${g.id}')">삭제</button>
        </div>
      </div>
      <div style="font-size:13px; color:#475569; margin-top:6px;">지시문: ${g.instruction}</div>
    </div>
  `).join("");
}

function startEditQuestionGroup(gid) {
  const g = kexamGroups.find(item => item.id === gid);
  if (!g) return;
  editingGroupId = gid;
  document.getElementById("keg-title").value = g.title;
  document.getElementById("keg-level").value = g.level;
  document.getElementById("keg-category").value = g.category;
  document.getElementById("keg-sample").value = g.sample_count || 0;
  document.getElementById("keg-instruction").value = g.instruction;
  document.getElementById("keg-passage").value = g.passage_text || "";
  document.getElementById("keg-img").value = g.image_url || "";
  document.getElementById("keg-audio").value = g.audio_url || "";
  document.getElementById("keg-tts").value = g.tts_text || "";

  document.getElementById("ke-gform-title").textContent = "[문제은행] 문제 그룹 수정 중";
  document.getElementById("keg-submit-btn").textContent = "그룹 수정 저장";
  document.getElementById("keg-cancel-btn").classList.remove("hidden");
}

function cancelEditQuestionGroup() {
  editingGroupId = null;
  document.getElementById("ke-g-form").reset();
  document.getElementById("ke-gform-title").textContent = "[문제은행] 새 문제 그룹(공통 지문/지시문) 등록";
  document.getElementById("keg-submit-btn").textContent = "그룹 저장하기";
  document.getElementById("keg-cancel-btn").classList.add("hidden");
}

async function submitQuestionGroup(e) {
  e.preventDefault();
  const body = {
    title: document.getElementById("keg-title").value,
    level: document.getElementById("keg-level").value,
    category: document.getElementById("keg-category").value,
    sample_count: parseInt(document.getElementById("keg-sample").value, 10) || 0,
    instruction: document.getElementById("keg-instruction").value,
    passage_text: document.getElementById("keg-passage").value,
    image_url: document.getElementById("keg-img").value,
    audio_url: document.getElementById("keg-audio").value,
    tts_text: document.getElementById("keg-tts").value,
    tags: []
  };

  const url = editingGroupId
    ? `/api/v1/modules/korean_exam/groups/${editingGroupId}`
    : "/api/v1/modules/korean_exam/groups";
  const res = await fetch(url, {
    method: editingGroupId ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) return showMsg("그룹 저장 실패", true);

  cancelEditQuestionGroup();
  showMsg("문제 그룹이 저장되었습니다.");
  loadExamGroupsList();
}

async function deleteQuestionGroup(gid) {
  if (!confirm("그룹을 삭제하면 소속된 문항도 함께 삭제됩니다. 계속할까요?")) return;
  await fetch(`/api/v1/modules/korean_exam/groups/${gid}`, { method: "DELETE", headers: getAuthHeaders(false) });
  loadExamGroupsList();
}

async function loadBankQuestionsList(page = 1) {
  currentBankPage = page;
  const q = document.getElementById("keq-search-q")?.value || "";
  const level = document.getElementById("keq-search-level")?.value || "";
  const category = document.getElementById("keq-search-cat")?.value || "";
  const qType = document.getElementById("keq-search-type")?.value || "";
  const tag = document.getElementById("keq-search-tag")?.value || "";
  const pageSize = document.getElementById("keq-bank-page-size")?.value || "15";

  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (q) params.append("q", q);
  if (level) params.append("level", level);
  if (category) params.append("category", category);
  if (qType) params.append("question_type", qType);
  if (tag) params.append("tag", tag);

  const res = await fetch(`/api/v1/modules/korean_exam/questions?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showMsg(err.detail || "문제은행 조회 권한 오류 (TEACHER 또는 ADMIN 등급 확인)", true);
    return;
  }

  const data = await res.json();
  kexamBankQuestions = data.items || [];
  document.getElementById("keq-bank-total").innerHTML = `전체 <b>${data.total}</b>문항 (${data.page} / ${data.total_pages} 페이지)`;

  const container = document.getElementById("keq-bank-list");
  const pagContainer = document.getElementById("keq-bank-pagination");

  if (!kexamBankQuestions.length) {
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b;">조건에 맞는 시험 문항이 없습니다.</p>`;
    return;
  }

  container.innerHTML = kexamBankQuestions.map(q => {
    const grpTitle = q.exam_question_groups?.title;
    return `
      <div class="word-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <div>
            <span class="pos-badge">${q.question_type === "MCQ" ? "객관식" : "주관식"} · ${q.level} · ${q.category}</span>
            <span class="tag">기본 ${q.points || 10}점</span>
            ${grpTitle ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8;">그룹: ${grpTitle}</span>` : ""}
            <strong style="margin-left:6px;">${q.prompt_text}</strong>
          </div>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button style="padding:4px 9px; font-size:12px;" onclick="startEditBankQuestion('${q.id}')">수정</button>
            <button class="danger" onclick="deleteBankQuestion('${q.id}')">삭제</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "loadBankQuestionsList");
}

function startEditBankQuestion(qid) {
  const q = kexamBankQuestions.find(item => item.id === qid);
  if (!q) return;
  editingQuestionId = qid;

  document.getElementById("keq-group-id").value = q.group_id || "";
  document.getElementById("keq-order").value = q.order_in_group || 1;
  document.getElementById("keq-type").value = q.question_type || "MCQ";
  toggleQuestionTypeFields();

  document.getElementById("keq-level").value = q.level || "초급";
  document.getElementById("keq-category").value = q.category || "읽기";
  document.getElementById("keq-points").value = q.points || 10;
  document.getElementById("keq-prompt").value = q.prompt_text;
  document.getElementById("keq-passage").value = q.passage_text || "";
  document.getElementById("keq-img").value = q.image_url || "";
  document.getElementById("keq-audio").value = q.audio_url || "";
  document.getElementById("keq-tts").value = q.tts_text || "";
  document.getElementById("keq-shuffle").checked = q.shuffle_choices !== false;
  document.getElementById("keq-correct-cid").value = q.correct_choice_id || "c1";
  document.getElementById("keq-short-answers").value = (q.correct_answers || []).join(", ");
  document.getElementById("keq-exp").value = q.explanation || "";
  document.getElementById("keq-tags").value = (q.tags || []).join(", ");

  renderChoicesEditor(q.choices || []);

  document.getElementById("ke-qform-title").textContent = "[문제은행] 시험 문항 수정 중";
  document.getElementById("keq-submit-btn").textContent = "문항 수정 저장";
  document.getElementById("keq-cancel-btn").classList.remove("hidden");
  document.getElementById("kexam-sec-questions").scrollIntoView({ behavior: "smooth" });
}

function cancelEditBankQuestion() {
  editingQuestionId = null;
  document.getElementById("ke-q-form").reset();
  document.getElementById("keq-type").value = "MCQ";
  toggleQuestionTypeFields();
  renderChoicesEditor([]);
  document.getElementById("ke-qform-title").textContent = "[문제은행] 새 시험 문항 등록";
  document.getElementById("keq-submit-btn").textContent = "문항 저장하기";
  document.getElementById("keq-cancel-btn").classList.add("hidden");
}

async function submitBankQuestion(e) {
  e.preventDefault();
  const qType = document.getElementById("keq-type").value;
  const choices = ["c1", "c2", "c3", "c4"].map(cid => ({
    id: cid,
    text: document.getElementById(`keq-ch-text-${cid}`).value.trim(),
    image_url: document.getElementById(`keq-ch-img-${cid}`).value.trim(),
    audio_url: document.getElementById(`keq-ch-aud-${cid}`).value.trim(),
    tts_text: document.getElementById(`keq-ch-tts-${cid}`).value.trim(),
  }));

  const body = {
    group_id: document.getElementById("keq-group-id").value || null,
    order_in_group: parseInt(document.getElementById("keq-order").value, 10) || 1,
    question_type: qType,
    level: document.getElementById("keq-level").value,
    category: document.getElementById("keq-category").value,
    points: parseInt(document.getElementById("keq-points").value, 10) || 10,
    prompt_text: document.getElementById("keq-prompt").value,
    passage_text: document.getElementById("keq-passage").value,
    image_url: document.getElementById("keq-img").value.trim(),
    audio_url: document.getElementById("keq-audio").value.trim(),
    tts_text: document.getElementById("keq-tts").value.trim(),
    shuffle_choices: document.getElementById("keq-shuffle").checked,
    choices: qType === "MCQ" ? choices : [],
    correct_choice_id: qType === "MCQ" ? document.getElementById("keq-correct-cid").value : "",
    correct_answers: qType === "SHORT" ? document.getElementById("keq-short-answers").value.split(",") : [],
    explanation: document.getElementById("keq-exp").value,
    tags: document.getElementById("keq-tags").value.split(",")
  };

  const url = editingQuestionId
    ? `/api/v1/modules/korean_exam/questions/${editingQuestionId}`
    : "/api/v1/modules/korean_exam/questions";
  const res = await fetch(url, {
    method: editingQuestionId ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) return showMsg("문항 저장 실패", true);

  cancelEditBankQuestion();
  showMsg("시험 문항이 저장되었습니다.");
  loadBankQuestionsList(currentBankPage);
}

async function deleteBankQuestion(qid) {
  await fetch(`/api/v1/modules/korean_exam/questions/${qid}`, { method: "DELETE", headers: getAuthHeaders(false) });
  loadBankQuestionsList(currentBankPage);
}