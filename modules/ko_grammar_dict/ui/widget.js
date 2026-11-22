var loadedGrammarItems = [];
var editingGrammarId = null;
var currentGrammarPage = 1;
var wordPickerTimer = null;
var grammarPickerTimer = null;
var pickedWordObj = null;
var pickedGrammarObj = null;

async function initGrammarModule() {
  editingGrammarId = null;
  currentGrammarPage = 1;
  pickedWordObj = null;
  pickedGrammarObj = null;

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  document.getElementById("grammar-admin-area").classList.toggle("hidden", !isAdmin);

  await searchGrammar(null, 1);
  await loadLinkedCorpusList();
}

function goGrammarPage(page) {
  searchGrammar(null, page);
  document.getElementById("grammar-title").scrollIntoView({ behavior: "smooth" });
}

async function searchGrammar(e, page = 1) {
  if (e) e.preventDefault();
  currentGrammarPage = page;

  const q = document.getElementById("g-search-q").value;
  const tag = document.getElementById("g-search-tag").value;
  const pageSize = document.getElementById("grammar-page-size").value || "15";

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q) params.append("q", q);
  if (tag) params.append("tag", tag);

  const container = document.getElementById("grammar-results");
  const pagContainer = document.getElementById("grammar-pagination");
  const totalInfo = document.getElementById("grammar-total-info");

  const res = await fetch(`/api/v1/modules/ko_grammar_dict/items?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    totalInfo.textContent = "";
    pagContainer.innerHTML = "";
    container.innerHTML = `<div style="padding:20px; text-align:center; color:#b91c1c; background:#fef2f2; border-radius:8px;">
      <b>접근 제한:</b> ${err.detail || "문법사전을 볼 권한이 없습니다."}
    </div>`;
    return;
  }

  const data = await res.json();
  loadedGrammarItems = data.items || [];
  totalInfo.innerHTML = `전체 <b>${data.total}</b>개 문법 (${data.page} / ${data.total_pages} 페이지)`;

  if (!loadedGrammarItems.length) {
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; text-align:center;">등록된 문법 항목이 없습니다.</p>`;
    return;
  }

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  container.innerHTML = loadedGrammarItems.map(g => `
    <div class="word-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:18px; color:#0f172a;">${g.pattern}</strong>
          <span class="pos-badge">${g.level}</span>
          <span style="margin-left:8px; font-size:15px; font-weight:600; color:#2563eb;">${g.meaning_id}</span>
        </div>
        ${isAdmin ? `
          <div style="display:flex; gap:6px;">
            <button style="padding:4px 9px; font-size:12px;" onclick="startEditGrammarItem('${g.id}')">수정</button>
            <button class="danger" onclick="deleteGrammarItem('${g.id}')">삭제</button>
          </div>` : ""}
      </div>
      ${g.usage_rule ? `<div style="font-size:13px; color:#475569; margin-top:6px;"><b>결합 규칙:</b> ${g.usage_rule}</div>` : ""}
      ${(g.examples && g.examples.length) ? `
        <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; font-size:13px;">
          ${g.examples.map(ex => `<div>• <b>${ex.ko}</b><br/><span style="color:#64748b;">&nbsp;&nbsp;${ex.id}</span></div>`).join("")}
        </div>` : ""}
      <div style="margin-top:8px;">
        ${(g.tags || []).map(t => `<span class="tag">#${t}</span>`).join("")}
      </div>
    </div>
  `).join("");

  pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "goGrammarPage");
}

function startEditGrammarItem(grammarId) {
  const item = loadedGrammarItems.find(g => g.id === grammarId);
  if (!item) return;

  editingGrammarId = grammarId;
  document.getElementById("g-pattern").value = item.pattern;
  document.getElementById("g-meaning").value = item.meaning_id;
  document.getElementById("g-level").value = item.level || "초급";
  document.getElementById("g-rule").value = item.usage_rule || "";
  document.getElementById("g-tags").value = (item.tags || []).join(", ");

  const firstEx = (item.examples && item.examples.length) ? item.examples[0] : null;
  document.getElementById("g-ex-ko").value = firstEx ? firstEx.ko : "";
  document.getElementById("g-ex-id").value = firstEx ? firstEx.id : "";

  document.getElementById("grammar-form-title").textContent = "[관리자] ① 한국어 문법 수정 중";
  document.getElementById("grammar-submit-btn").textContent = "수정 내용 저장";
  document.getElementById("grammar-cancel-btn").classList.remove("hidden");
  document.getElementById("grammar-admin-area").scrollIntoView({ behavior: "smooth" });
}

function cancelEditGrammarItem() {
  editingGrammarId = null;
  const form = document.getElementById("grammar-item-form");
  if (form) form.reset();
  document.getElementById("grammar-form-title").textContent = "[관리자] ① 새 한국어 문법 등록";
  document.getElementById("grammar-submit-btn").textContent = "문법 등록하기";
  document.getElementById("grammar-cancel-btn").classList.add("hidden");
}

async function submitGrammarItem(e) {
  e.preventDefault();
  const exKo = document.getElementById("g-ex-ko").value.trim();
  const exId = document.getElementById("g-ex-id").value.trim();

  const url = editingGrammarId
    ? `/api/v1/modules/ko_grammar_dict/items/${editingGrammarId}`
    : "/api/v1/modules/ko_grammar_dict/items";
  const method = editingGrammarId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify({
      pattern: document.getElementById("g-pattern").value,
      meaning_id: document.getElementById("g-meaning").value,
      level: document.getElementById("g-level").value,
      usage_rule: document.getElementById("g-rule").value,
      tags: document.getElementById("g-tags").value.split(","),
      examples: (exKo || exId) ? [{ ko: exKo, id: exId }] : []
    })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(`저장 실패: ${data.detail || "오류"}`, true);

  const wasEditing = Boolean(editingGrammarId);
  cancelEditGrammarItem();
  showMsg(wasEditing ? "문법 항목이 수정되었습니다." : "새 문법 항목이 등록되었습니다.");
  await searchGrammar(null, currentGrammarPage);
}

async function deleteGrammarItem(id) {
  if (editingGrammarId === id) cancelEditGrammarItem();
  await fetch(`/api/v1/modules/ko_grammar_dict/items/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  await searchGrammar(null, currentGrammarPage);
}

/* 실시간 자동완성 검색 피커 */
function onSearchWordPicker(keyword) {
  clearTimeout(wordPickerTimer);
  const dropdown = document.getElementById("picker-word-dropdown");

  wordPickerTimer = setTimeout(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "15" });
    if (keyword && keyword.trim()) params.append("q", keyword.trim());

    const res = await fetch(`/api/v1/modules/ko_id_dict/words?${params.toString()}`, {
      headers: getAuthHeaders(false)
    });
    if (!res.ok) return;
    const data = await res.json();
    const words = data.items || [];

    if (!words.length) {
      dropdown.innerHTML = `<div class="picker-item" style="color:#94a3b8; cursor:default;">일치하는 단어가 없습니다.</div>`;
    } else {
      dropdown.innerHTML = words.map(w => `
        <div class="picker-item" onclick='selectWordFromPicker(${JSON.stringify({ id: w.id, word_ko: w.word_ko, meaning_id: w.meaning_id, pos: w.pos })})'>
          <span><b>${w.word_ko}</b> <small style="color:#64748b;">(${w.pos})</small></span>
          <span style="color:#2563eb; font-weight:600;">${w.meaning_id}</span>
        </div>
      `).join("");
    }
    dropdown.classList.remove("hidden");
  }, 220);
}

function selectWordFromPicker(wordObj) {
  pickedWordObj = wordObj;
  document.getElementById("selected-word-id").value = wordObj.id;
  document.getElementById("selected-word-text").textContent = `${wordObj.word_ko} (${wordObj.meaning_id})`;
  document.getElementById("selected-word-chip").classList.remove("hidden");
  document.getElementById("picker-word-input").classList.add("hidden");
  document.getElementById("picker-word-dropdown").classList.add("hidden");
  autoFillCorpusNote();
}

function clearPickedWord() {
  pickedWordObj = null;
  document.getElementById("selected-word-id").value = "";
  document.getElementById("selected-word-chip").classList.add("hidden");
  const input = document.getElementById("picker-word-input");
  input.value = "";
  input.classList.remove("hidden");
  input.focus();
}

function onSearchGrammarPicker(keyword) {
  clearTimeout(grammarPickerTimer);
  const dropdown = document.getElementById("picker-grammar-dropdown");

  grammarPickerTimer = setTimeout(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "15" });
    if (keyword && keyword.trim()) params.append("q", keyword.trim());

    const res = await fetch(`/api/v1/modules/ko_grammar_dict/items?${params.toString()}`, {
      headers: getAuthHeaders(false)
    });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];

    if (!items.length) {
      dropdown.innerHTML = `<div class="picker-item" style="color:#94a3b8; cursor:default;">일치하는 문법이 없습니다.</div>`;
    } else {
      dropdown.innerHTML = items.map(g => `
        <div class="picker-item" onclick='selectGrammarFromPicker(${JSON.stringify({ id: g.id, pattern: g.pattern, meaning_id: g.meaning_id, level: g.level })})'>
          <span><b>${g.pattern}</b> <small style="color:#64748b;">[${g.level}]</small></span>
          <span style="color:#7c3aed; font-weight:600;">${g.meaning_id}</span>
        </div>
      `).join("");
    }
    dropdown.classList.remove("hidden");
  }, 220);
}

function selectGrammarFromPicker(gramObj) {
  pickedGrammarObj = gramObj;
  document.getElementById("selected-grammar-id").value = gramObj.id;
  document.getElementById("selected-grammar-text").textContent = `${gramObj.pattern} (${gramObj.meaning_id})`;
  document.getElementById("selected-grammar-chip").classList.remove("hidden");
  document.getElementById("picker-grammar-input").classList.add("hidden");
  document.getElementById("picker-grammar-dropdown").classList.add("hidden");
  autoFillCorpusNote();
}

function clearPickedGrammar() {
  pickedGrammarObj = null;
  document.getElementById("selected-grammar-id").value = "";
  document.getElementById("selected-grammar-chip").classList.add("hidden");
  const input = document.getElementById("picker-grammar-input");
  input.value = "";
  input.classList.remove("hidden");
  input.focus();
}

function autoFillCorpusNote() {
  const noteInput = document.getElementById("corpus-note");
  if (pickedWordObj && pickedGrammarObj && !noteInput.value.trim()) {
    noteInput.value = `${pickedWordObj.word_ko} + ${pickedGrammarObj.pattern}`;
  }
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".picker-box")) {
    const wd = document.getElementById("picker-word-dropdown");
    const gd = document.getElementById("picker-grammar-dropdown");
    if (wd) wd.classList.add("hidden");
    if (gd) gd.classList.add("hidden");
  }
});

async function createLinkedCorpus(e) {
  e.preventDefault();
  const dict_word_id = document.getElementById("selected-word-id").value;
  const grammar_id = document.getElementById("selected-grammar-id").value;
  if (!dict_word_id || !grammar_id) {
    return showMsg("검색창에서 연결할 단어와 문법을 각각 클릭해 선택해 주세요.", true);
  }

  const res = await fetch("/api/v1/modules/conn_dict_grammar/corpus", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      dict_word_id,
      grammar_id,
      note: document.getElementById("corpus-note").value,
      sentence_ko: document.getElementById("corpus-sent-ko").value,
      sentence_id: document.getElementById("corpus-sent-id").value
    })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(`말뭉치 저장 실패: ${data.detail || "오류"}`, true);

  clearPickedWord();
  clearPickedGrammar();
  document.getElementById("corpus-note").value = "";
  document.getElementById("corpus-sent-ko").value = "";
  document.getElementById("corpus-sent-id").value = "";
  showMsg("한-인사전 단어와 문법이 연결된 말뭉치가 저장되었습니다!");
  await loadLinkedCorpusList();
}

var loadedGrammarCorpusList = [];
var editingGrammarCorpusId = null;
var currentGrammarCorpusPage = 1;

function startEditLinkedCorpus(corpusId) {
  const item = loadedGrammarCorpusList.find(c => c.id === corpusId);
  if (!item) return;

  editingGrammarCorpusId = corpusId;
  const w = item.ko_id_dictionary || {};
  const g = item.ko_grammar_dictionary || {};

  selectWordFromPicker({
    id: item.dict_word_id,
    word_ko: w.word_ko || "선택된 단어",
    meaning_id: w.meaning_id || "-"
  });
  selectGrammarFromPicker({
    id: item.grammar_id,
    pattern: g.pattern || "선택된 문법",
    meaning_id: g.meaning_id || "-"
  });

  document.getElementById("corpus-note").value = item.note || "";
  document.getElementById("corpus-sent-ko").value = item.sentence_ko || "";
  document.getElementById("corpus-sent-id").value = item.sentence_id || "";

  document.getElementById("corpus-form-title").textContent = "[연결 모듈] ② 말뭉치 수정 중";
  document.getElementById("corpus-submit-btn").textContent = "수정 내용 저장";
  document.getElementById("corpus-cancel-btn").classList.remove("hidden");
  document.getElementById("grammar-corpus-box").scrollIntoView({ behavior: "smooth" });
}

function cancelEditLinkedCorpus() {
  editingGrammarCorpusId = null;
  clearPickedWord();
  clearPickedGrammar();
  document.getElementById("corpus-note").value = "";
  document.getElementById("corpus-sent-ko").value = "";
  document.getElementById("corpus-sent-id").value = "";
  document.getElementById("corpus-form-title").textContent = "[연결 모듈] ② 한-인사전 단어 + 문법 검색 결합 말뭉치 저장";
  document.getElementById("corpus-submit-btn").textContent = "말뭉치 연결 및 저장";
  document.getElementById("corpus-cancel-btn").classList.add("hidden");
}

async function submitLinkedCorpus(e) {
  e.preventDefault();
  const dict_word_id = document.getElementById("selected-word-id").value;
  const grammar_id = document.getElementById("selected-grammar-id").value;
  if (!dict_word_id || !grammar_id) {
    return showMsg("검색창에서 연결할 단어와 문법을 각각 클릭해 선택해 주세요.", true);
  }

  const url = editingGrammarCorpusId
    ? `/api/v1/modules/conn_dict_grammar/corpus/${editingGrammarCorpusId}`
    : "/api/v1/modules/conn_dict_grammar/corpus";
  const method = editingGrammarCorpusId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify({
      dict_word_id,
      grammar_id,
      note: document.getElementById("corpus-note").value,
      sentence_ko: document.getElementById("corpus-sent-ko").value,
      sentence_id: document.getElementById("corpus-sent-id").value
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(`말뭉치 저장 실패: ${data.detail || "오류"}`, true);

  const wasEditing = Boolean(editingGrammarCorpusId);
  cancelEditLinkedCorpus();
  showMsg(wasEditing ? "말뭉치가 수정되었습니다." : "한-인사전 단어와 문법이 연결된 말뭉치가 저장되었습니다!");
  await loadLinkedCorpusList(wasEditing ? currentGrammarCorpusPage : 1);
}

async function loadLinkedCorpusList(page = 1) {
  currentGrammarCorpusPage = page;
  const container = document.getElementById("corpus-list");
  const pagContainer = document.getElementById("corpus-pagination");
  const totalEl = document.getElementById("grammar-corpus-total");

  const res = await fetch(`/api/v1/modules/conn_dict_grammar/corpus?page=${page}&page_size=10`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    if (totalEl) totalEl.textContent = "";
    if (pagContainer) pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b;">말뭉치 연결 모듈이 비활성화되었거나 접근 권한이 없습니다.</p>`;
    return;
  }

  const data = await res.json();
  loadedGrammarCorpusList = data.items || [];
  if (totalEl) totalEl.innerHTML = `전체 <b>${data.total}</b>개 (${data.page} / ${data.total_pages} 페이지)`;

  if (!loadedGrammarCorpusList.length) {
    if (pagContainer) pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; font-size:13px;">아직 연결되어 저장된 말뭉치가 없습니다.</p>`;
    return;
  }

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  container.innerHTML = loadedGrammarCorpusList.map(c => {
    const w = c.ko_id_dictionary || {};
    const g = c.ko_grammar_dictionary || {};
    return `
      <div class="word-card" style="background:#faf5ff; border-color:#e9d5ff;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span class="tag" style="background:#dbeafe; color:#1e40af;">단어: ${w.word_ko || "-"} (${w.meaning_id || "-"})</span>
            <span class="tag" style="background:#f3e8ff; color:#6b21a8;">문법: ${g.pattern || "-"} (${g.meaning_id || "-"})</span>
            ${c.note ? `<small style="color:#64748b; margin-left:6px;">[${c.note}]</small>` : ""}
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:6px;">
              <button style="padding:4px 9px; font-size:12px;" onclick="startEditLinkedCorpus('${c.id}')">수정</button>
              <button class="danger" onclick="deleteLinkedCorpus('${c.id}')">삭제</button>
            </div>` : ""}
        </div>
        <div style="margin-top:8px; font-size:14px;">
          <b>${c.sentence_ko}</b><br/>
          <span style="color:#475569; font-size:13px;">${c.sentence_id}</span>
        </div>
      </div>
    `;
  }).join("");

  if (pagContainer) {
    pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "loadLinkedCorpusList");
  }
}

async function deleteLinkedCorpus(id) {
  if (editingGrammarCorpusId === id) cancelEditLinkedCorpus();
  await fetch(`/api/v1/modules/conn_dict_grammar/corpus/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  await loadLinkedCorpusList(currentGrammarCorpusPage);
}