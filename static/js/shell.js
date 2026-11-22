var currentUser = null;
var availableMenus = [];
const loadedScripts = new Set();

function getAuthHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("access_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function showMsg(text, isError = false) {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + (isError ? "error" : "success");
}

function clearMsg() {
  const el = document.getElementById("message");
  if (!el) return;
  el.textContent = "";
  el.className = "msg";
}

function renderPaginationBar(currentPage, totalPages, callbackFnName) {
  if (!totalPages || totalPages <= 1) return "";
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  let html = `<div class="pagination-bar">`;
  html += `<button type="button" class="page-btn" ${currentPage <= 1 ? "disabled" : ""} onclick="${callbackFnName}(1)">« 처음</button>`;
  html += `<button type="button" class="page-btn" ${currentPage <= 1 ? "disabled" : ""} onclick="${callbackFnName}(${currentPage - 1})">‹ 이전</button>`;
  for (let p = startPage; p <= endPage; p++) {
    html += `<button type="button" class="page-btn ${p === currentPage ? "active" : ""}" onclick="${callbackFnName}(${p})">${p}</button>`;
  }
  html += `<button type="button" class="page-btn" ${currentPage >= totalPages ? "disabled" : ""} onclick="${callbackFnName}(${currentPage + 1})">다음 ›</button>`;
  html += `<button type="button" class="page-btn" ${currentPage >= totalPages ? "disabled" : ""} onclick="${callbackFnName}(${totalPages})">끝 »</button>`;
  html += `</div>`;
  return html;
}

// 외부 HTML 조각 + JS 스크립트를 동적으로 로드해 #app-mount-point에 마운트하는 범용 엔진
async function mountFragment({ htmlUrl, jsUrl, cssUrl, initFn, initArg, wrapperPrefix = "" }) {
  clearMsg();
  const mount = document.getElementById("app-mount-point");
  const cacheBuster = `?v=${Date.now()}`;

  try {
    if (cssUrl && !document.querySelector(`link[data-frag-css="${cssUrl}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl + cacheBuster;
      link.setAttribute("data-frag-css", cssUrl);
      document.head.appendChild(link);
    }

    const res = await fetch(htmlUrl + cacheBuster);
    if (!res.ok) throw new Error(`UI 파일을 불러오지 못했습니다. (${htmlUrl})`);
    mount.innerHTML = wrapperPrefix + (await res.text());

    if (jsUrl && !loadedScripts.has(jsUrl)) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = jsUrl + cacheBuster;
        script.onload = () => {
          loadedScripts.add(jsUrl);
          resolve();
        };
        script.onerror = () => reject(new Error(`스크립트를 불러오지 못했습니다. (${jsUrl})`));
        document.body.appendChild(script);
      });
    }

    if (initFn && typeof window[initFn] === "function") {
      await window[initFn](initArg);
    }
  } catch (err) {
    mount.innerHTML = `<div class="card" style="color:#b91c1c;">화면 로드 오류: ${err.message}</div>`;
  }
}

// 코어 기본 뷰(auth, admin) 열기 -> /static/base/auth/auth.html, /static/base/admin/admin.html
function openBaseView(pkgName, initArg) {
  const initMap = { auth: "initAuthView", admin: "initAdminView" };
  return mountFragment({
    htmlUrl: `/static/base/${pkgName}/${pkgName}.html`,
    jsUrl: `/static/base/${pkgName}/${pkgName}.js`,
    initFn: initMap[pkgName],
    initArg
  });
}

// 확장 도구(module) 열기
async function openModule(moduleId) {
  const meta = availableMenus.find(m => m.module_id === moduleId);
  if (!meta || !meta.ui) return;

  const assetMod = meta.ui.asset_module || moduleId;
  await mountFragment({
    htmlUrl: `/static/modules/${assetMod}/${meta.ui.html}`,
    jsUrl: meta.ui.js ? `/static/modules/${assetMod}/${meta.ui.js}` : null,
    cssUrl: meta.ui.css ? `/static/modules/${assetMod}/${meta.ui.css}` : null,
    initFn: meta.ui.init_fn,
    initArg: moduleId,
    wrapperPrefix: `
      <div style="margin-bottom:10px;">
        <button type="button" class="secondary" style="padding:6px 12px; font-size:12px;" onclick="openToolsDirectory()">← 도구 목록으로 돌아가기</button>
      </div>`
  });

  const titleEl = document.querySelector("#app-mount-point h2");
  if (titleEl && meta.name) titleEl.textContent = meta.name;
}

async function fetchToolsList() {
  try {
    const res = await fetch("/api/v1/modules/menu", { headers: getAuthHeaders(false) });
    if (!res.ok) return [];
    availableMenus = await res.json();
    return availableMenus.filter(m => m.ui);
  } catch {
    return [];
  }
}

async function openToolsDirectory() {
  clearMsg();
  await fetchToolsList();
  const mount = document.getElementById("app-mount-point");
  mount.innerHTML = `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h2 style="margin:0;">언어 교육 도구</h2>
          <p style="font-size:13px; color:#64748b; margin:4px 0 0 0;">사용할 학습 도구를 선택하세요.</p>
        </div>
        <div style="min-width:240px;">
          <input type="text" id="tools-search-input" placeholder="도구 이름 또는 설명 검색..." oninput="renderToolsDirectory()" />
        </div>
      </div>
      <div id="tools-grid-container" class="tools-grid"></div>
    </div>`;
  renderToolsDirectory();
}

function renderToolsDirectory() {
  const container = document.getElementById("tools-grid-container");
  if (!container) return;
  const keyword = (document.getElementById("tools-search-input")?.value || "").trim().toLowerCase();
  const labelMap = { PUBLIC: "누구나 사용", MEMBER: "회원 전용", GRADE: "등급 제한" };
  const badgeColorMap = {
    PUBLIC: "background:#dcfce7; color:#166534;",
    MEMBER: "background:#dbeafe; color:#1e40af;",
    GRADE: "background:#f3e8ff; color:#6b21a8;"
  };

  const uiTools = availableMenus.filter(m =>
    m.ui && (!keyword || (m.name || "").toLowerCase().includes(keyword) || (m.description || "").toLowerCase().includes(keyword))
  );

  container.innerHTML = uiTools.length
    ? uiTools.map(tool => `
        <div class="tool-card" onclick="openModule('${tool.module_id}')">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
              <div class="tool-card-title">${tool.name}</div>
              <span class="tag" style="${badgeColorMap[tool.access_type] || ""}; white-space:nowrap;">${labelMap[tool.access_type] || tool.access_type}</span>
            </div>
            <div class="tool-card-desc">${tool.description || "설명이 등록되지 않은 언어 교육 도구입니다."}</div>
          </div>
          <div style="font-size:12px; font-weight:700; color:#2563eb;">도구 열기 →</div>
        </div>`).join("")
    : `<p style="color:#64748b; grid-column:1/-1; text-align:center; padding:24px;">표시할 학습 도구가 없습니다.</p>`;
}

async function checkCurrentUser() {
  const token = localStorage.getItem("access_token");
  if (!token) {
    currentUser = null;
  } else {
    try {
      const res = await fetch("/api/v1/auth/me", { headers: getAuthHeaders(false) });
      currentUser = res.ok ? await res.json() : null;
      if (!res.ok) localStorage.removeItem("access_token");
    } catch {
      currentUser = null;
    }
  }

  const navRight = document.getElementById("nav-user-area");
  if (currentUser) {
    const isAdmin = currentUser.grade === "ADMIN";
    navRight.innerHTML = `
      <span style="font-size:13px;">${currentUser.nickname} (${currentUser.grade})</span>
      <button class="menu-btn" onclick="openBaseView('admin', 'profile')">${isAdmin ? "관리자 / 내 정보" : "마이페이지"}</button>
      <button class="menu-btn" onclick="handleLogout()">로그아웃</button>`;
  } else {
    navRight.innerHTML = `<button class="menu-btn" onclick="openBaseView('auth')">로그인 / 회원가입</button>`;
  }
}

function handleLogout() {
  localStorage.removeItem("access_token");
  checkCurrentUser();
  openToolsDirectory();
  showMsg("로그아웃 되었습니다.");
}

(async function init() {
  await checkCurrentUser();
  await fetchToolsList();

  const urlParams = new URLSearchParams(window.location.search);
  const directModule = urlParams.get("module");
  if (directModule && availableMenus.some(m => m.module_id === directModule && m.ui)) {
    await openModule(directModule);
  } else {
    await openToolsDirectory();
  }
})();