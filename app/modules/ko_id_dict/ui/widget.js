var currentDictModule = "ko_id_dict";
var loadedDictWords = [];
var editingDictWordId = null;
var currentDictPage = 1;

function initDictModule(moduleId) {
  currentDictModule = moduleId || activeModuleId || "ko_id_dict";
  editingDictWordId = null;
  currentDictPage = 1;
  const isKoId = moduleId === "ko_id_dict";

  document.getElementById("dict-title").textContent = isKoId ? "한국어 - 인도네시아어 사전" : "인도네시아어 - 한국어 사전";
  document.getElementById("lbl-word").textContent = isKoId ? "한국어 표제어" : "인도네시아어 표제어";
  document.getElementById("lbl-meaning").textContent = isKoId ? "인도네시아어 뜻" : "한국어 뜻";
  document.getElementById("lbl-ex1").textContent = isKoId ? "예문 (한국어)" : "예문 (인도네시아어)";
  document.getElementById("lbl-ex2").textContent = isKoId ? "예문 번역 (인도네시아어)" : "예문 해석 (한국어)";

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  document.getElementById("dict-admin-add").classList.toggle("hidden", !isAdmin);

  searchDictionary(null, 1);
}

function goDictPage(page) {
  searchDictionary(null, page);
  document.getElementById("dict-title").scrollIntoView({ behavior: "smooth" });
}

async function searchDictionary(e, page = 1) {
  if (e) e.preventDefault();
  currentDictPage = page;

  const q = document.getElementById("search-q").value;
  const tag = document.getElementById("search-tag").value;
  const pageSize = document.getElementById("dict-page-size").value || "15";

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q) params.append("q", q);
  if (tag) params.append("tag", tag);

  const container = document.getElementById("dict-results");
  const pagContainer = document.getElementById("dict-pagination");
  const totalInfo = document.getElementById("dict-total-info");

  const res = await fetch(`/api/v1/modules/${currentDictModule}/words?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    totalInfo.textContent = "";
    pagContainer.innerHTML = "";
    container.innerHTML = `<div style="padding:24px; text-align:center; color:#b91c1c; background:#fef2f2; border-radius:8px;">
      <b>접근 제한 또는 오류 (${res.status}):</b> ${err.detail || "이 모듈을 사용할 수 없습니다."}
    </div>`;
    return;
  }

  const data = await res.json();
  loadedDictWords = data.items || [];
  totalInfo.innerHTML = `전체 <b>${data.total}</b>개 항목 (${data.page} / ${data.total_pages} 페이지)`;

  if (!loadedDictWords.length) {
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; text-align:center;">등록되거나 검색된 단어가 없습니다.</p>`;
    return;
  }

  const isKoId = currentDictModule === "ko_id_dict";
  const isAdmin = currentUser && currentUser.grade === "ADMIN";

  container.innerHTML = loadedDictWords.map(w => {
    const headWord = isKoId ? w.word_ko : w.word_id;
    const meaningWord = isKoId ? w.meaning_id : w.meaning_ko;
    return `
      <div class="word-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong style="font-size:18px; color:#0f172a;">${headWord}</strong>
            <span class="pos-badge">${w.pos}</span>
            <span style="margin-left:8px; font-size:15px; font-weight:600; color:#2563eb;">${meaningWord}</span>
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:6px;">
              <button style="padding:4px 9px; font-size:12px;" onclick="startEditDictWord('${w.id}')">수정</button>
              <button class="danger" onclick="deleteDictWord('${w.id}')">삭제</button>
            </div>` : ""}
        </div>
        <div style="font-size:13px; color:#475569; margin-top:6px;">
          <b>유의어:</b> ${(w.synonyms && w.synonyms.length) ? w.synonyms.join(", ") : "-"} &nbsp;|&nbsp;
          <b>반대말:</b> ${(w.antonyms && w.antonyms.length) ? w.antonyms.join(", ") : "-"}
        </div>
        ${(w.examples && w.examples.length) ? `
          <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; font-size:13px;">
            ${w.examples.map(ex => isKoId
              ? `<div>• <b>${ex.ko}</b><br/><span style="color:#64748b;">&nbsp;&nbsp;${ex.id}</span></div>`
              : `<div>• <b>${ex.id}</b><br/><span style="color:#64748b;">&nbsp;&nbsp;${ex.ko}</span></div>`
            ).join("")}
          </div>` : ""}
        ${(w.grammar_corpus && w.grammar_corpus.length) ? `
          <div style="margin-top:8px; padding:10px; background:#f5f3ff; border:1px solid #ddd6fe; border-radius:6px; font-size:13px;">
            <b style="color:#5b21b6;">[연결된 문법 말뭉치]</b>
            ${w.grammar_corpus.map(c => `
              <div style="margin-top:4px;">
                <span class="tag" style="background:#ede9fe; color:#5b21b6;">${c.pattern}</span>
                <b>${c.sentence_ko}</b> <span style="color:#64748b;">(${c.sentence_id})</span>
              </div>
            `).join("")}
          </div>` : ""}
        <div style="margin-top:8px;">
          ${(w.tags || []).map(t => `<span class="tag">#${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "goDictPage");
}

function startEditDictWord(wordId) {
  const item = loadedDictWords.find(w => w.id === wordId);
  if (!item) return;

  editingDictWordId = wordId;
  const isKoId = currentDictModule === "ko_id_dict";

  document.getElementById("w-head").value = isKoId ? item.word_ko : item.word_id;
  document.getElementById("w-mean").value = isKoId ? item.meaning_id : item.meaning_ko;
  document.getElementById("w-pos").value = item.pos || "명사";
  document.getElementById("w-syn").value = (item.synonyms || []).join(", ");
  document.getElementById("w-ant").value = (item.antonyms || []).join(", ");
  document.getElementById("w-tags").value = (item.tags || []).join(", ");

  const firstEx = (item.examples && item.examples.length) ? item.examples[0] : null;
  document.getElementById("w-ex1").value = firstEx ? (isKoId ? firstEx.ko : firstEx.id) : "";
  document.getElementById("w-ex2").value = firstEx ? (isKoId ? firstEx.id : firstEx.ko) : "";

  document.getElementById("dict-form-title").textContent = "[관리자] 단어 수정 중";
  document.getElementById("dict-submit-btn").textContent = "수정 내용 저장";
  document.getElementById("dict-cancel-btn").classList.remove("hidden");
  document.getElementById("dict-admin-add").scrollIntoView({ behavior: "smooth" });
}

function cancelEditDictWord() {
  editingDictWordId = null;
  const form = document.getElementById("dict-word-form");
  if (form) form.reset();
  document.getElementById("dict-form-title").textContent = "[관리자] 새 단어 등록";
  document.getElementById("dict-submit-btn").textContent = "단어 등록하기";
  document.getElementById("dict-cancel-btn").classList.add("hidden");
}

async function submitDictWord(e) {
  e.preventDefault();
  const isKoId = currentDictModule === "ko_id_dict";
  const head = document.getElementById("w-head").value;
  const mean = document.getElementById("w-mean").value;
  const ex1 = document.getElementById("w-ex1").value.trim();
  const ex2 = document.getElementById("w-ex2").value.trim();

  const body = isKoId
    ? {
        word_ko: head,
        meaning_id: mean,
        pos: document.getElementById("w-pos").value,
        synonyms: document.getElementById("w-syn").value.split(","),
        antonyms: document.getElementById("w-ant").value.split(","),
        tags: document.getElementById("w-tags").value.split(","),
        examples: (ex1 || ex2) ? [{ ko: ex1, id: ex2 }] : []
      }
    : {
        word_id: head,
        meaning_ko: mean,
        pos: document.getElementById("w-pos").value,
        synonyms: document.getElementById("w-syn").value.split(","),
        antonyms: document.getElementById("w-ant").value.split(","),
        tags: document.getElementById("w-tags").value.split(","),
        examples: (ex1 || ex2) ? [{ id: ex1, ko: ex2 }] : []
      };

  const url = editingDictWordId
    ? `/api/v1/modules/${currentDictModule}/words/${editingDictWordId}`
    : `/api/v1/modules/${currentDictModule}/words`;
  const method = editingDictWordId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(`저장 실패: ${data.detail || "알 수 없는 오류"}`, true);

  const wasEditing = Boolean(editingDictWordId);
  cancelEditDictWord();
  showMsg(wasEditing ? "단어가 수정되었습니다." : "새 단어가 등록되었습니다.");
  searchDictionary(null, currentDictPage);
}

async function deleteDictWord(id) {
  if (editingDictWordId === id) cancelEditDictWord();
  await fetch(`/api/v1/modules/${currentDictModule}/words/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  searchDictionary(null, currentDictPage);
}