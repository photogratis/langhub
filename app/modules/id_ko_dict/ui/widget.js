var loadedIdKoWords = [];
var editingIdKoWordId = null;
var currentIdKoPage = 1;

function initIdKoDictModule() {
  editingIdKoWordId = null;
  currentIdKoPage = 1;

  const isAdmin = currentUser && currentUser.grade === "ADMIN";
  document.getElementById("idko-admin-add").classList.toggle("hidden", !isAdmin);
  toggleIdKoAffixFields();
  searchIdKoDictionary(null, 1);
}

function toggleIdKoAffixFields() {
  const isRoot = document.getElementById("idko-is-root").value === "true";
  document.getElementById("idko-affix-type-box").classList.toggle("hidden", isRoot);
  document.getElementById("idko-affixes-box").classList.toggle("hidden", isRoot);

  const rootInput = document.getElementById("idko-root-word");
  if (isRoot) {
    rootInput.placeholder = "비워두면 표제어가 자동으로 어근이 됩니다";
  } else {
    rootInput.placeholder = "필수 입력: 원형 어근 (예: makan)";
  }
}

function goIdKoPage(page) {
  searchIdKoDictionary(null, page);
  document.getElementById("idko-dict-title").scrollIntoView({ behavior: "smooth" });
}

function filterByRootWord(rootWord) {
  document.getElementById("idko-search-q").value = rootWord;
  document.getElementById("idko-search-affix").value = "";
  document.getElementById("idko-search-dialect").value = "";
  document.getElementById("idko-search-origin").value = "";
  document.getElementById("idko-search-tag").value = "";
  searchIdKoDictionary(null, 1);
}

async function searchIdKoDictionary(e, page = 1) {
  if (e) e.preventDefault();
  currentIdKoPage = page;

  const q = document.getElementById("idko-search-q").value;
  const tag = document.getElementById("idko-search-tag").value;
  const dialect = document.getElementById("idko-search-dialect").value;
  const origin = document.getElementById("idko-search-origin").value;
  const affix_filter = document.getElementById("idko-search-affix").value;
  const pageSize = document.getElementById("idko-page-size").value || "15";

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q) params.append("q", q);
  if (tag) params.append("tag", tag);
  if (dialect) params.append("dialect", dialect);
  if (origin) params.append("origin", origin);
  if (affix_filter) params.append("affix_filter", affix_filter);

  const container = document.getElementById("idko-results");
  const pagContainer = document.getElementById("idko-pagination");
  const totalInfo = document.getElementById("idko-total-info");

  const res = await fetch(`/api/v1/modules/id_ko_dict/words?${params.toString()}`, {
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
  loadedIdKoWords = data.items || [];
  totalInfo.innerHTML = `전체 <b>${data.total}</b>개 항목 (${data.page} / ${data.total_pages} 페이지)`;

  if (!loadedIdKoWords.length) {
    pagContainer.innerHTML = "";
    container.innerHTML = `<p style="color:#64748b; text-align:center;">등록되거나 검색된 단어가 없습니다.</p>`;
    return;
  }

  const isAdmin = currentUser && currentUser.grade === "ADMIN";

  container.innerHTML = loadedIdKoWords.map(w => {
    const rootDisplay = w.root_word || w.word_id;
    const affixSummary = w.is_root
      ? `<span class="tag" style="background:#dcfce7; color:#166534;">어근 (Kata Dasar)</span>`
      : `<span class="tag" style="background:#fef3c7; color:#92400e;">${w.affix_type}${w.affixes && w.affixes.length ? ` : ${w.affixes.join(", ")}` : ""}</span>
         <span class="tag" style="background:#e0e7ff; color:#3730a3; cursor:pointer;" onclick='filterByRootWord(${JSON.stringify(rootDisplay)})'>어근: ${rootDisplay}</span>`;

    const isStandardDialect = (w.dialect || "").startsWith("표준어");
    const dialectBadge = `<span class="tag" style="${isStandardDialect ? "background:#f1f5f9; color:#475569;" : "background:#ffe4e6; color:#9f1239;"}">지역/방언: ${w.dialect || "표준어"}</span>`;
    const originBadge = `<span class="tag" style="background:#f3e8ff; color:#6b21a8;">유래: ${w.origin || "고유어"}</span>`;

    return `
      <div class="word-card">
        <!-- 상단: 표제어 + 품사 + 뜻 + 관리자 버튼 -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div>
            <strong style="font-size:19px; color:#0f172a;">${w.word_id}</strong>
            <span class="pos-badge">${w.pos}</span>
            <span style="margin-left:8px; font-size:16px; font-weight:700; color:#2563eb;">${w.meaning_ko}</span>
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:6px; flex-shrink:0;">
              <button style="padding:4px 9px; font-size:12px;" onclick="startEditIdKoWord('${w.id}')">수정</button>
              <button class="danger" onclick="deleteIdKoWord('${w.id}')">삭제</button>
            </div>` : ""}
        </div>

        <!-- 형태소(어근/접사) & 방언 & 어원 배지 줄 -->
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
          ${affixSummary}
          ${dialectBadge}
          ${originBadge}
        </div>

        ${w.origin_note ? `
          <div style="font-size:12px; color:#6b21a8; background:#faf5ff; padding:5px 9px; border-radius:5px; margin-top:6px;">
            <b>어원 메모:</b> ${w.origin_note}
          </div>` : ""}

        <div style="font-size:13px; color:#475569; margin-top:8px;">
          <b>유의어:</b> ${(w.synonyms && w.synonyms.length) ? w.synonyms.join(", ") : "-"} &nbsp;|&nbsp;
          <b>반대말:</b> ${(w.antonyms && w.antonyms.length) ? w.antonyms.join(", ") : "-"}
        </div>

        <!-- 동일 어근 관련 단어 묶음 박스 -->
        ${(w.related_root_words && w.related_root_words.length) ? `
          <div style="margin-top:10px; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; font-size:13px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <b style="color:#1e40af;">[동일 어근 '${rootDisplay}' 파생·관련 단어 (${w.related_root_words.length}개)]</b>
              <button type="button" style="padding:2px 8px; font-size:11px; background:#1d4ed8;" onclick='filterByRootWord(${JSON.stringify(rootDisplay)})'>어근 가족 전체 보기</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${w.related_root_words.map(rel => `
                <span
                  style="background:#fff; border:1px solid #93c5fd; padding:4px 8px; border-radius:6px; font-size:12px; cursor:pointer;"
                  onclick='filterByRootWord(${JSON.stringify(rootDisplay)})'
                >
                  <b>${rel.word_id}</b>
                  <small style="color:#64748b;">(${rel.is_root ? "어근" : (rel.affixes && rel.affixes.length ? rel.affixes.join("+") : rel.affix_type)})</small>
                  : <span style="color:#2563eb;">${rel.meaning_ko}</span>
                </span>
              `).join("")}
            </div>
          </div>` : ""}

        ${(w.examples && w.examples.length) ? `
          <div style="margin-top:8px; padding:8px; background:#fff; border-radius:6px; font-size:13px;">
            ${w.examples.map(ex => `<div>• <b>${ex.id}</b><br/><span style="color:#64748b;">&nbsp;&nbsp;${ex.ko}</span></div>`).join("")}
          </div>` : ""}

        <div style="margin-top:8px;">
          ${(w.tags || []).map(t => `<span class="tag">#${t}</span>`).join("")}
        </div>
      </div>
    `;
  }).join("");

  pagContainer.innerHTML = renderPaginationBar(data.page, data.total_pages, "goIdKoPage");
}

function startEditIdKoWord(wordId) {
  const item = loadedIdKoWords.find(w => w.id === wordId);
  if (!item) return;

  editingIdKoWordId = wordId;
  document.getElementById("idko-head").value = item.word_id;
  document.getElementById("idko-mean").value = item.meaning_ko;
  document.getElementById("idko-pos").value = item.pos || "명사";

  document.getElementById("idko-is-root").value = item.is_root ? "true" : "false";
  toggleIdKoAffixFields();
  document.getElementById("idko-root-word").value = item.root_word || "";
  document.getElementById("idko-affix-type").value = item.affix_type || "접두사(Awalan)";
  document.getElementById("idko-affixes").value = (item.affixes || []).join(", ");

  document.getElementById("idko-dialect").value = item.dialect || "표준어 (Bahasa Baku)";
  document.getElementById("idko-origin").value = item.origin || "고유어 (Asli Melayu/Indonesia)";
  document.getElementById("idko-origin-note").value = item.origin_note || "";

  document.getElementById("idko-syn").value = (item.synonyms || []).join(", ");
  document.getElementById("idko-ant").value = (item.antonyms || []).join(", ");
  document.getElementById("idko-tags").value = (item.tags || []).join(", ");

  const firstEx = (item.examples && item.examples.length) ? item.examples[0] : null;
  document.getElementById("idko-ex1").value = firstEx ? firstEx.id : "";
  document.getElementById("idko-ex2").value = firstEx ? firstEx.ko : "";

  document.getElementById("idko-form-title").textContent = "[관리자] 인도네시아어 단어 수정 중";
  document.getElementById("idko-submit-btn").textContent = "수정 내용 저장";
  document.getElementById("idko-cancel-btn").classList.remove("hidden");
  document.getElementById("idko-admin-add").scrollIntoView({ behavior: "smooth" });
}

function cancelEditIdKoWord() {
  editingIdKoWordId = null;
  const form = document.getElementById("idko-word-form");
  if (form) form.reset();
  document.getElementById("idko-is-root").value = "true";
  toggleIdKoAffixFields();
  document.getElementById("idko-form-title").textContent = "[관리자] 새 인도네시아어 단어 등록";
  document.getElementById("idko-submit-btn").textContent = "단어 등록하기";
  document.getElementById("idko-cancel-btn").classList.add("hidden");
}

async function submitIdKoWord(e) {
  e.preventDefault();
  const isRoot = document.getElementById("idko-is-root").value === "true";
  const ex1 = document.getElementById("idko-ex1").value.trim();
  const ex2 = document.getElementById("idko-ex2").value.trim();

  const body = {
    word_id: document.getElementById("idko-head").value,
    meaning_ko: document.getElementById("idko-mean").value,
    pos: document.getElementById("idko-pos").value,
    is_root: isRoot,
    root_word: document.getElementById("idko-root-word").value,
    affix_type: isRoot ? "어근" : document.getElementById("idko-affix-type").value,
    affixes: isRoot ? [] : document.getElementById("idko-affixes").value.split(","),
    dialect: document.getElementById("idko-dialect").value,
    origin: document.getElementById("idko-origin").value,
    origin_note: document.getElementById("idko-origin-note").value,
    synonyms: document.getElementById("idko-syn").value.split(","),
    antonyms: document.getElementById("idko-ant").value.split(","),
    tags: document.getElementById("idko-tags").value.split(","),
    examples: (ex1 || ex2) ? [{ id: ex1, ko: ex2 }] : []
  };

  const url = editingIdKoWordId
    ? `/api/v1/modules/id_ko_dict/words/${editingIdKoWordId}`
    : "/api/v1/modules/id_ko_dict/words";
  const method = editingIdKoWordId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(`저장 실패: ${data.detail || "알 수 없는 오류"}`, true);

  const wasEditing = Boolean(editingIdKoWordId);
  cancelEditIdKoWord();
  showMsg(wasEditing ? "단어가 수정되었습니다." : "새 단어가 등록되었습니다.");
  searchIdKoDictionary(null, currentIdKoPage);
}

async function deleteIdKoWord(id) {
  if (editingIdKoWordId === id) cancelEditIdKoWord();
  await fetch(`/api/v1/modules/id_ko_dict/words/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  searchIdKoDictionary(null, currentIdKoPage);
}