var cWordTimer = null;
var cGramTimer = null;
var cPickedWord = null;
var cPickedGram = null;
var loadedStandaloneCorpusList = [];
var editingStandaloneCorpusId = null;
var currentStandaloneCorpusPage = 1;

async function initCorpusModule() {
  editingStandaloneCorpusId = null;
  currentStandaloneCorpusPage = 1;
  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  document.getElementById("corpus-admin-box").classList.toggle("hidden", !isAdmin);
  await searchStandaloneCorpus(null, 1);
}

function goStandaloneCorpusPage(page) {
  searchStandaloneCorpus(null, page);
  document.getElementById("corpus-module-title").scrollIntoView({ behavior: "smooth" });
}

function searchStandaloneWord(keyword) {
  clearTimeout(cWordTimer);
  const dropdown = document.getElementById("c-word-dropdown");
  cWordTimer = setTimeout(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "15" });
    if (keyword && keyword.trim()) params.append("q", keyword.trim());

    const res = await fetch(`/api/v1/modules/ko_id_dict/words?${params.toString()}`, { headers: getAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json();
    const words = data.items || [];

    dropdown.innerHTML = words.length
      ? words.map(w => `
          <div class="picker-item" onclick='pickStandaloneWord(${JSON.stringify({ id: w.id, word_ko: w.word_ko, meaning_id: w.meaning_id })})'>
            <b>${w.word_ko}</b>
            <span style="color:#2563eb;">${w.meaning_id}</span>
          </div>`).join("")
      : `<div class="picker-item" style="color:#94a3b8;">일치하는 단어가 없습니다.</div>`;
    dropdown.classList.remove("hidden");
  }, 220);
}

function pickStandaloneWord(obj) {
  cPickedWord = obj;
  document.getElementById("c-word-id").value = obj.id;
  document.getElementById("c-word-text").textContent = `${obj.word_ko} (${obj.meaning_id})`;
  document.getElementById("c-word-chip").classList.remove("hidden");
  document.getElementById("c-word-input").classList.add("hidden");
  document.getElementById("c-word-dropdown").classList.add("hidden");
  if (cPickedWord && cPickedGram && !document.getElementById("c-note").value) {
    document.getElementById("c-note").value = `${cPickedWord.word_ko} + ${cPickedGram.pattern}`;
  }
}

function clearStandaloneWord() {
  cPickedWord = null;
  document.getElementById("c-word-id").value = "";
  document.getElementById("c-word-chip").classList.add("hidden");
  const inp = document.getElementById("c-word-input");
  inp.value = "";
  inp.classList.remove("hidden");
}

function searchStandaloneGrammar(keyword) {
  clearTimeout(cGramTimer);
  const dropdown = document.getElementById("c-grammar-dropdown");
  cGramTimer = setTimeout(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "15" });
    if (keyword && keyword.trim()) params.append("q", keyword.trim());

    const res = await fetch(`/api/v1/modules/ko_grammar_dict/items?${params.toString()}`, { headers: getAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];

    dropdown.innerHTML = items.length
      ? items.map(g => `
          <div class="picker-item" onclick='pickStandaloneGrammar(${JSON.stringify({ id: g.id, pattern: g.pattern, meaning_id: g.meaning_id })})'>
            <b>${g.pattern}</b>
            <span style="color:#7c3aed;">${g.meaning_id}</span>
          </div>`).join("")
      : `<div class="picker-item" style="color:#94a3b8;">일치하는 문법이 없습니다.</div>`;
    dropdown.classList.remove("hidden");
  }, 220);
}

function pickStandaloneGrammar(obj) {
  cPickedGram = obj;
  document.getElementById("c-grammar-id").value = obj.id;
  document.getElementById("c-grammar-text").textContent = `${obj.pattern} (${obj.meaning_id})`;
  document.getElementById("c-grammar-chip").classList.remove("hidden");
  document.getElementById("c-grammar-input").classList.add("hidden");
  document.getElementById("c-grammar-dropdown").classList.add("hidden");
  if (cPickedWord && cPickedGram && !document.getElementById("c-note").value) {
    document.getElementById("c-note").value = `${cPickedWord.word_ko} + ${cPickedGram.pattern}`;
  }
}

function clearStandaloneGrammar() {
  cPickedGram = null;
  document.getElementById("c-grammar-id").value = "";
  document.getElementById("c-grammar-chip").classList.add("hidden");
  const inp = document.getElementById("c-grammar-input");
  inp.value = "";
  inp.classList.remove("hidden");
}

function startEditStandaloneCorpus(corpusId) {
  const item = loadedStandaloneCorpusList.find(c => c.id === corpusId);
  if (!item) return;

  editingStandaloneCorpusId = corpusId;
  const w = item.ko_id_dictionary || {};
  const g = item.ko_grammar_dictionary || {};

  pickStandaloneWord({
    id: item.dict_word_id,
    word_ko: w.word_ko || "선택된 단어",
    meaning_id: w.meaning_id || "-"
  });
  pickStandaloneGrammar({
    id: item.grammar_id,
    pattern: g.pattern || "선택된 문법",
    meaning_id: g.meaning_id || "-"
  });

  document.getElementById("c-note").value = item.note || "";
  document.getElementById("c-sent-ko").value = item.sentence_ko || "";
  document.getElementById("c-sent-id").value = item.sentence_id || "";

  document.getElementById("c-form-title").textContent = "[관리자] 말뭉치 수정 중";
  document.getElementById("c-submit-btn").textContent = "수정 내용 저장";
  document.getElementById("c-cancel-btn").classList.remove("hidden");
  document.getElementById("corpus-admin-box").scrollIntoView({ behavior: "smooth" });
}

function cancelEditStandaloneCorpus() {
  editingStandaloneCorpusId = null;
  clearStandaloneWord();
  clearStandaloneGrammar();
  document.getElementById("c-note").value = "";
  document.getElementById("c-sent-ko").value = "";
  document.getElementById("c-sent-id").value = "";
  document.getElementById("c-form-title").textContent = "[관리자] 새 말뭉치 연결 및 저장";
  document.getElementById("c-submit-btn").textContent = "말뭉치 저장";
  document.getElementById("c-cancel-btn").classList.add("hidden");
}

async function submitStandaloneCorpus(e) {
  e.preventDefault();
  const dict_word_id = document.getElementById("c-word-id").value;
  const grammar_id = document.getElementById("c-grammar-id").value;
  if (!dict_word_id || !grammar_id) return showMsg("단어와 문법을 모두 선택해 주세요.", true);

  const url = editingStandaloneCorpusId
    ? `/api/v1/modules/conn_dict_grammar/corpus/${editingStandaloneCorpusId}`
    : "/api/v1/modules/conn_dict_grammar/corpus";
  const method = editingStandaloneCorpusId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify({
      dict_word_id,
      grammar_id,
      note: document.getElementById("c-note").value,
      sentence_ko: document.getElementById("c-sent-ko").value,
      sentence_id: document.getElementById("c-sent-id").value
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(`저장 실패: ${data.detail || "오류"}`, true);

  const wasEditing = Boolean(editingStandaloneCorpusId);
  cancelEditStandaloneCorpus();
  showMsg(wasEditing ? "말뭉치가 수정되었습니다." : "말뭉치가 저장되었습니다.");
  await searchStandaloneCorpus(null, wasEditing ? currentStandaloneCorpusPage : 1);
}

async function searchStandaloneCorpus(e, page = 1) {
  if (e) e.preventDefault();
  currentStandaloneCorpusPage = page;

  const q = document.getElementById("c-search-q")?.value || "";
  const pageSize = document.getElementById("c-page-size")?.value || "15";

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim()) params.append("q", q.trim());

  const container = document.getElementById("standalone-corpus-list");
  const pagContainer = document.getElementById("c-pagination");
  const totalInfo = document.getElementById("c-total-info");

  const res = await fetch(`/api/v1/modules/conn_dict_grammar/corpus?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });
  if (!res.ok) {
    totalInfo.textContent = "";
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#b91c1c;">말뭉치 조회 권한이 없거나 오류가 발생했습니다.</p>`;
    return;
  }

  const data = await res.json();
  loadedStandaloneCorpusList = data.items || [];
  totalInfo.innerHTML = `전체 <b>${data.total}</b>개 말뭉치 (${data.page} / ${data.total_pages} 페이지)`;

  if (!loadedStandaloneCorpusList.length) {
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; text-align:center;">등록되거나 검색된 말뭉치가 없습니다.</p>`;
    return;
  }

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  container.innerHTML = loadedStandaloneCorpusList.map(c => {
    const w = c.ko_id_dictionary || {};
    const g = c.ko_grammar_dictionary || {};
    return `
      <div class="word-card" style="background:#faf5ff; border-color:#e9d5ff;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span class="tag" style="background:#dbeafe; color:#1e40af;">단어: ${w.word_ko || "-"} (${w.meaning_id || "-"})</span>
            <span class="tag" style="background:#f3e8ff; color:#6b21a8;">문법: ${g.pattern || "-"} (${g.meaning_id || "-"})</span>
            ${c.note ? `<small style="color:#64748b; margin-left:4px;">[${c.note}]</small>` : ""}
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:6px;">
              <button style="padding:4px 9px; font-size:12px;" onclick="startEditStandaloneCorpus('${c.id}')">수정</button>
              <button class="danger" onclick="deleteStandaloneCorpus('${c.id}')">삭제</button>
            </div>` : ""}
        </div>
        <div style="margin-top:8px; font-size:14px;">
          <b>${c.sentence_ko}</b><br/>
          <small style="color:#475569;">${c.sentence_id}</small>
        </div>
      </div>`;
  }).join("");

  pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "goStandaloneCorpusPage");
}

async function deleteStandaloneCorpus(id) {
  if (editingStandaloneCorpusId === id) cancelEditStandaloneCorpus();
  await fetch(`/api/v1/modules/conn_dict_grammar/corpus/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  await searchStandaloneCorpus(null, currentStandaloneCorpusPage);
}