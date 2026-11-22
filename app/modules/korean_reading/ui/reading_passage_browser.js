/* =========================================================
   korean_reading/ui/reading_passage_browser.js
   - 지문 통합 검색(제목·내용·태그) 및 페이지네이션 렌더러
   ========================================================= */

var krStudyPage = 1;
var krAdminPage = 1;
const KR_PAGE_SIZE = 6;

function filterReadingPassagesLocally(list, levelId, qId) {
  const level = document.getElementById(levelId)?.value || "";
  const kw = (document.getElementById(qId)?.value || "").trim().toLowerCase();

  return (list || []).filter(p => {
    if (level && p.level !== level) return false;
    if (!kw) return true;
    const inTitle = (p.title || "").toLowerCase().includes(kw);
    const inContent = (p.content || "").toLowerCase().includes(kw);
    const inTags = (p.tags || []).some(t => t.toLowerCase().includes(kw));
    return inTitle || inContent || inTags;
  });
}

// 학습자 탭: 검색 + 페이지네이션 렌더링
function renderStudyPassagesPaged(page = 1) {
  krStudyPage = page;
  const listEl = document.getElementById("kr-passage-list");
  if (!listEl) return;

  const filtered = filterReadingPassagesLocally(kreadingPassagesCache, "kr-filter-level", "kr-filter-q");
  const totalPages = Math.max(1, Math.ceil(filtered.length / KR_PAGE_SIZE));
  if (krStudyPage > totalPages) krStudyPage = totalPages;

  const paged = filtered.slice((krStudyPage - 1) * KR_PAGE_SIZE, krStudyPage * KR_PAGE_SIZE);
  if (!paged.length) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">검색 조건에 맞는 지문이 없습니다.</p>`;
    return;
  }

  const cardsHtml = paged.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
      <div>
        <div>
          <span class="pos-badge">${p.level}</span>
          <strong style="font-size:15px; margin-left:6px;">${p.title}</strong>
          ${(p.tags || []).map(t => `<span class="tag" style="margin-left:4px;">#${t}</span>`).join("")}
        </div>
        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
          ${p.char_count}음절 (${p.word_count}어절) · ${p.author_name || "선생님"}
        </div>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" style="background:#0284c7; padding:7px 10px; font-size:12px;" onclick="playPassageTtsById('${p.id}', 1.0)">🔊 듣기</button>
        <button type="button" style="background:#2563eb; padding:7px 14px;" onclick="selectReadingPassageForTest('${p.id}')">이 지문 읽기</button>
      </div>
    </div>
  `).join("");

  const pagerHtml = typeof renderPaginationBar === "function"
    ? renderPaginationBar(krStudyPage, totalPages, "renderStudyPassagesPaged")
    : "";

  listEl.innerHTML = cardsHtml + pagerHtml;
}

// 관리자 탭: 검색 + 수정/삭제 버튼 + 페이지네이션 렌더링
function renderAdminPassagesPaged(page = 1) {
  krAdminPage = page;
  const container = document.getElementById("kr-admin-passage-list");
  if (!container) return;

  const filtered = filterReadingPassagesLocally(kreadingPassagesCache, "kr-admin-filter-level", "kr-admin-search-q");
  const totalPages = Math.max(1, Math.ceil(filtered.length / KR_PAGE_SIZE));
  if (krAdminPage > totalPages) krAdminPage = totalPages;

  const paged = filtered.slice((krAdminPage - 1) * KR_PAGE_SIZE, krAdminPage * KR_PAGE_SIZE);
  if (!paged.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">표시할 지문이 없습니다.</p>`;
    return;
  }

  const cardsHtml = paged.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
      <div>
        <span class="pos-badge">${p.level}</span>
        <strong style="margin-left:6px;">${p.title}</strong>
        ${(p.tags || []).map(t => `<span class="tag" style="margin-left:4px;">#${t}</span>`).join("")}
        <div style="font-size:12px; color:#64748b; margin-top:3px;">${p.char_count}음절 (${p.word_count}어절)</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" style="background:#0284c7; padding:6px 10px; font-size:12px;" onclick="playPassageTtsById('${p.id}', 1.0)">🔊 듣기</button>
        <button type="button" style="background:#f59e0b; padding:6px 10px; font-size:12px;" onclick="startEditReadingPassage('${p.id}')">✏️ 수정</button>
        <button type="button" style="background:#dc2626; padding:6px 10px; font-size:12px;" onclick="deleteReadingPassage('${p.id}')">삭제</button>
      </div>
    </div>
  `).join("");

  const pagerHtml = typeof renderPaginationBar === "function"
    ? renderPaginationBar(krAdminPage, totalPages, "renderAdminPassagesPaged")
    : "";

  container.innerHTML = cardsHtml + pagerHtml;
}