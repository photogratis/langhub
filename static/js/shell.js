var currentUser = null;
var availableMenus = [];
var activeModuleId = null;
const loadedModuleScripts = new Set();

var adminCachedModules = [];
var adminCachedUsers = [];
var adminCachedGrades = [];
var currentAdminModPage = 1;
var currentAdminUserPage = 1;
var currentAdminGradePage = 1;

function getAuthHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("access_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function showMsg(text, isError = false) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = "msg " + (isError ? "error" : "success");
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
/* =========================================================
   모바일 우측 슬라이딩 드로어 제어
   ========================================================= */
function openMobileDrawer() {
  const drawer = document.getElementById("mobile-drawer");
  const backdrop = document.getElementById("mobile-drawer-backdrop");
  if (drawer) {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  if (backdrop) backdrop.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeMobileDrawer() {
  const drawer = document.getElementById("mobile-drawer");
  const backdrop = document.getElementById("mobile-drawer-backdrop");
  if (drawer) {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.classList.remove("open");
  document.body.style.overflow = "";
}

function showShellView(viewName) {
  closeMobileDrawer();
  document.getElementById("message").className = "msg";
  document.getElementById("view-tools").classList.toggle("hidden", viewName !== "tools");
  document.getElementById("module-mount-point").classList.toggle("hidden", viewName !== "module");
  document.getElementById("view-auth").classList.toggle("hidden", viewName !== "auth");
  document.getElementById("view-admin").classList.toggle("hidden", viewName !== "admin");

  if (viewName === "admin") {
    loadAdminAndProfile("profile");
  }
}

function toggleAuthForm(type) {
  document.getElementById("login-form").classList.toggle("hidden", type !== "login");
  document.getElementById("signup-form").classList.toggle("hidden", type !== "signup");
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

async function fetchToolsList() {
  try {
    const res = await fetch("/api/v1/modules/menu");
    if (!res.ok) return [];
    availableMenus = await res.json();
    return availableMenus.filter(m => m.ui);
  } catch {
    return [];
  }
}

async function openToolsDirectory() {
  await fetchToolsList();
  showShellView("tools");
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

  const uiTools = availableMenus.filter(m => {
    if (!m.ui) return false;
    if (!keyword) return true;
    return (m.name || "").toLowerCase().includes(keyword) ||
           (m.description || "").toLowerCase().includes(keyword);
  });

  if (!uiTools.length) {
    container.innerHTML = `<p style="color:#64748b; grid-column:1/-1; text-align:center; padding:24px;">표시할 학습 도구가 없습니다.</p>`;
    return;
  }

  container.innerHTML = uiTools.map(tool => `
    <div class="tool-card" onclick="openModule('${tool.module_id}')">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:8px;">
          <div class="tool-card-title">${tool.name}</div>
          <span class="tag" style="${badgeColorMap[tool.access_type] || ""}; white-space:nowrap;">
            ${labelMap[tool.access_type] || tool.access_type}
          </span>
        </div>
        <div class="tool-card-desc">
          ${tool.description || "설명이 등록되지 않은 언어 교육 도구입니다."}
        </div>
      </div>
      <div style="font-size:12px; font-weight:700; color:#2563eb;">도구 열기 →</div>
    </div>
  `).join("");
}

async function openModule(moduleId) {
  const meta = availableMenus.find(m => m.module_id === moduleId);
  if (!meta || !meta.ui) return;

  activeModuleId = moduleId;
  showShellView("module");

  const widgetBody = document.getElementById("module-widget-body") || document.getElementById("module-mount-point");
  const assetMod = meta.ui.asset_module || moduleId;
  const cacheBuster = `?v=${Date.now()}`;
  const htmlUrl = `/static/modules/${assetMod}/${meta.ui.html}${cacheBuster}`;
  const jsUrl = `/static/modules/${assetMod}/${meta.ui.js}${cacheBuster}`;
  const baseJsKey = `${assetMod}/${meta.ui.js}`;

  try {
    if (meta.ui.css) {
      const cssUrl = `/static/modules/${assetMod}/${meta.ui.css}${cacheBuster}`;
      if (!document.querySelector(`link[data-mod-css="${assetMod}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssUrl;
        link.setAttribute("data-mod-css", assetMod);
        document.head.appendChild(link);
      }
    }

    const htmlRes = await fetch(htmlUrl);
    if (!htmlRes.ok) throw new Error("위젯 HTML을 불러올 수 없습니다.");
    widgetBody.innerHTML = await htmlRes.text();

    const titleEl = widgetBody.querySelector("h2");
    if (titleEl && meta.name) {
      titleEl.textContent = meta.name;
    }

    if (meta.ui.js && !loadedModuleScripts.has(baseJsKey)) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = jsUrl;
        script.onload = () => {
          loadedModuleScripts.add(baseJsKey);
          resolve();
        };
        script.onerror = () => reject(new Error("위젯 JS를 불러올 수 없습니다."));
        document.body.appendChild(script);
      });
    }

    if (meta.ui.init_fn && typeof window[meta.ui.init_fn] === "function") {
      await window[meta.ui.init_fn](moduleId);
      const afterTitleEl = widgetBody.querySelector("h2");
      if (afterTitleEl && meta.name) {
        afterTitleEl.textContent = meta.name;
      }
    }
  } catch (err) {
    widgetBody.innerHTML = `<div class="card" style="color:#b91c1c;">모듈 UI 로드 오류: ${err.message}</div>`;
  }
}

async function checkCurrentUser() {
  const token = localStorage.getItem("access_token");
  if (!token) {
    currentUser = null;
  } else {
    try {
      const res = await fetch("/api/v1/auth/me", { headers: getAuthHeaders(false) });
      if (res.ok) {
        currentUser = await res.json();
      } else {
        localStorage.removeItem("access_token");
        currentUser = null;
      }
    } catch {
      currentUser = null;
    }
  }

  const navRight = document.getElementById("nav-user-area");
  const drawerBody = document.getElementById("mobile-drawer-content");

  if (currentUser) {
    const isAdmin = currentUser.grade === "ADMIN";
    const myPageLabel = isAdmin ? "관리자 / 내 정보" : "마이페이지";

    // PC 상단 헤더 영역
    if (navRight) {
      navRight.innerHTML = `
        <span style="font-size:13px;">${currentUser.nickname} (${currentUser.grade})</span>
        <button class="menu-btn" onclick="showShellView('admin')">${myPageLabel}</button>
        <button class="menu-btn" onclick="handleLogout()">로그아웃</button>
      `;
    }

    // 모바일 우측 슬라이딩 드로어 영역
    if (drawerBody) {
      drawerBody.innerHTML = `
        <div class="drawer-user-card">
          <div class="drawer-user-name">${currentUser.nickname} 님</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:2px;">${currentUser.email}</div>
          <span class="drawer-user-grade">${currentUser.grade}</span>
        </div>
        <button type="button" class="drawer-item-btn primary" onclick="openToolsDirectory()">📚 도구 목록</button>
        <button type="button" class="drawer-item-btn" onclick="showShellView('admin')">👤 ${myPageLabel}</button>
        <button type="button" class="drawer-item-btn danger-outline" onclick="handleLogout()">🚪 로그아웃</button>
      `;
    }
  } else {
    if (navRight) {
      navRight.innerHTML = `<button class="menu-btn" onclick="showShellView('auth')">로그인 / 회원가입</button>`;
    }
    if (drawerBody) {
      drawerBody.innerHTML = `
        <div class="drawer-user-card">
          <div class="drawer-user-name">방문자 (비회원)</div>
          <div style="font-size:12px; color:#94a3b8; margin-top:4px;">로그인하면 학습 기록을 저장할 수 있습니다.</div>
        </div>
        <button type="button" class="drawer-item-btn primary" onclick="openToolsDirectory()">📚 도구 목록</button>
        <button type="button" class="drawer-item-btn" onclick="showShellView('auth')">🔑 로그인 / 회원가입</button>
      `;
    }
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const res = await fetch("/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: document.getElementById("signup-email").value,
      nickname: document.getElementById("signup-nickname").value,
      password: document.getElementById("signup-password").value
    })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "가입 실패", true);
  showMsg("회원가입 완료! 로그인해 주세요.");
  toggleAuthForm("login");
}

async function handleLogin(e) {
  e.preventDefault();
  const formData = new URLSearchParams();
  formData.append("username", document.getElementById("login-email").value);
  formData.append("password", document.getElementById("login-password").value);

  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "로그인 실패", true);

  localStorage.setItem("access_token", data.access_token);
  await checkCurrentUser();

  if (sessionStorage.getItem("kexam_guest_pending_result") && availableMenus.some(m => m.module_id === "korean_exam")) {
    await openModule("korean_exam");
  } else {
    await openToolsDirectory();
  }
  showMsg("로그인되었습니다.");
}

function handleLogout() {
  localStorage.removeItem("access_token");
  checkCurrentUser();
  openToolsDirectory();
  showMsg("로그아웃 되었습니다.");
}

/* =========================================================
   [관리자 및 마이페이지 서브 메뉴 전환 & 페이지네이션 로직]
   ========================================================= */

function switchAdminTab(tabName) {
  document.getElementById("message").className = "msg";
  const allTabs = ["profile", "modules", "users", "grades"];

  allTabs.forEach(t => {
    const sec = document.getElementById(`admin-sec-${t}`);
    const btn = document.getElementById(`btn-subtab-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) btn.classList.toggle("active", t === tabName);
  });

  if (tabName === "modules") renderAdminModulesPage(currentAdminModPage);
  if (tabName === "users") renderAdminUsersPage(currentAdminUserPage);
  if (tabName === "grades") renderAdminGradesPage(currentAdminGradePage);
}

async function loadAdminAndProfile(initialTab = "profile") {
  if (!currentUser) return showShellView("auth");

  document.getElementById("my-profile-card").innerHTML = `
    <div style="font-size:14px; line-height:1.8;">
      <div><b>닉네임:</b> ${currentUser.nickname}</div>
      <div><b>이메일:</b> ${currentUser.email}</div>
      <div><b>현재 등급:</b> <span class="tag">${currentUser.grade}</span></div>
    </div>
  `;

  const isAdmin = currentUser.grade === "ADMIN";
  document.querySelectorAll(".admin-tab-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });

  if (!isAdmin) {
    switchAdminTab("profile");
    return;
  }

  const [modRes, gradeRes, userRes] = await Promise.all([
    fetch("/api/v1/admin/modules", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/grades", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/users", { headers: getAuthHeaders(false) })
  ]);

  adminCachedModules = modRes.ok ? await modRes.json() : [];
  adminCachedGrades = gradeRes.ok ? await gradeRes.json() : [];
  adminCachedUsers = userRes.ok ? await userRes.json() : [];

  const gradeFilterEl = document.getElementById("admin-user-grade-filter");
  if (gradeFilterEl) {
    const prevVal = gradeFilterEl.value;
    gradeFilterEl.innerHTML = `<option value="ALL">전체 등급</option>` +
      adminCachedGrades.map(g => `<option value="${g.code}">${g.name} (${g.code})</option>`).join("");
    if ([...gradeFilterEl.options].some(o => o.value === prevVal)) {
      gradeFilterEl.value = prevVal;
    }
  }

  switchAdminTab(initialTab);
}

function renderAdminModulesPage(page = 1) {
  currentAdminModPage = page;
  const keyword = (document.getElementById("admin-mod-search")?.value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("admin-mod-filter")?.value || "ALL";
  const pageSize = parseInt(document.getElementById("admin-mod-pagesize")?.value || "10", 10);

  let filtered = adminCachedModules.filter(m => {
    const matchText = !keyword ||
      (m.name || "").toLowerCase().includes(keyword) ||
      (m.description || "").toLowerCase().includes(keyword) ||
      m.module_id.toLowerCase().includes(keyword);
    const matchStatus = statusFilter === "ALL" || (statusFilter === "ON" ? m.is_enabled : !m.is_enabled);
    return matchText && matchStatus;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentAdminModPage > totalPages) currentAdminModPage = totalPages;

  const start = (currentAdminModPage - 1) * pageSize;
  const pagedItems = filtered.slice(start, start + pageSize);

  document.getElementById("admin-mod-summary").innerHTML = `전체 <b>${total}</b>개 도구 (${currentAdminModPage} / ${totalPages} 페이지)`;

  const tbody = document.getElementById("admin-module-list");
  if (!pagedItems.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748b; padding:18px;">조건에 일치하는 도구가 없습니다.</td></tr>`;
  } else {
    tbody.innerHTML = pagedItems.map(m => `
      <tr>
        <td>
          <input type="text" id="mod-name-${m.module_id}" value="${(m.name || "").replace(/"/g, "&quot;")}" placeholder="${m.default_name}" />
          <small style="color:#64748b; display:block; margin-top:3px;">ID: ${m.module_id}</small>
        </td>
        <td>
          <input type="text" id="mod-desc-${m.module_id}" value="${(m.description || "").replace(/"/g, "&quot;")}" placeholder="도구 설명을 입력하세요..." />
        </td>
        <td>
          <select id="mod-en-${m.module_id}">
            <option value="true" ${m.is_enabled ? "selected" : ""}>ON</option>
            <option value="false" ${!m.is_enabled ? "selected" : ""}>OFF</option>
          </select>
        </td>
        <td>
          <select id="mod-acc-${m.module_id}">
            <option value="PUBLIC" ${m.access_type === "PUBLIC" ? "selected" : ""}>비회원 (누구나)</option>
            <option value="MEMBER" ${m.access_type === "MEMBER" ? "selected" : ""}>회원 (전체)</option>
            <option value="GRADE" ${m.access_type === "GRADE" ? "selected" : ""}>회원 (등급지정)</option>
          </select>
        </td>
        <td><input type="text" id="mod-gr-${m.module_id}" value="${(m.allowed_grades || []).join(", ")}" placeholder="예: PRO, VIP" /></td>
        <td><button onclick="saveModulePolicy('${m.module_id}')">적용</button></td>
      </tr>
    `).join("");
  }

  document.getElementById("admin-mod-pagination").innerHTML = renderPaginationBar(currentAdminModPage, totalPages, "renderAdminModulesPage");
}

function renderAdminUsersPage(page = 1) {
  currentAdminUserPage = page;
  const keyword = (document.getElementById("admin-user-search")?.value || "").trim().toLowerCase();
  const gradeFilter = document.getElementById("admin-user-grade-filter")?.value || "ALL";
  const statusFilter = document.getElementById("admin-user-status-filter")?.value || "ALL";
  const pageSize = parseInt(document.getElementById("admin-user-pagesize")?.value || "10", 10);

  let filtered = adminCachedUsers.filter(u => {
    const matchText = !keyword || u.email.toLowerCase().includes(keyword) || u.nickname.toLowerCase().includes(keyword);
    const matchGrade = gradeFilter === "ALL" || u.grade === gradeFilter;
    const matchStatus = statusFilter === "ALL" || (statusFilter === "ACTIVE" ? u.is_active : !u.is_active);
    return matchText && matchGrade && matchStatus;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentAdminUserPage > totalPages) currentAdminUserPage = totalPages;

  const start = (currentAdminUserPage - 1) * pageSize;
  const pagedItems = filtered.slice(start, start + pageSize);

  document.getElementById("admin-user-summary").innerHTML = `전체 <b>${total}</b>명 회원 (${currentAdminUserPage} / ${totalPages} 페이지)`;

  const tbody = document.getElementById("admin-user-list");
  if (!pagedItems.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#64748b; padding:18px;">조건에 일치하는 회원이 없습니다.</td></tr>`;
  } else {
    tbody.innerHTML = pagedItems.map(u => `
      <tr>
        <td>${u.email}</td>
        <td><b>${u.nickname}</b></td>
        <td>
          <select id="u-gr-${u.id}">
            ${adminCachedGrades.map(g => `<option value="${g.code}" ${u.grade === g.code ? "selected" : ""}>${g.name} (${g.code})</option>`).join("")}
          </select>
        </td>
        <td>
          <select id="u-ac-${u.id}">
            <option value="true" ${u.is_active ? "selected" : ""}>활성</option>
            <option value="false" ${!u.is_active ? "selected" : ""}>정지</option>
          </select>
        </td>
        <td><button onclick="saveUserAdmin('${u.id}')">적용</button></td>
      </tr>
    `).join("");
  }

  document.getElementById("admin-user-pagination").innerHTML = renderPaginationBar(currentAdminUserPage, totalPages, "renderAdminUsersPage");
}

function renderAdminGradesPage(page = 1) {
  currentAdminGradePage = page;
  const pageSize = parseInt(document.getElementById("admin-grade-pagesize")?.value || "10", 10);

  const sortedGrades = [...adminCachedGrades].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  const total = sortedGrades.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentAdminGradePage > totalPages) currentAdminGradePage = totalPages;

  const start = (currentAdminGradePage - 1) * pageSize;
  const pagedItems = sortedGrades.slice(start, start + pageSize);

  document.getElementById("admin-grade-summary").innerHTML = `전체 <b>${total}</b>개 등급 (${currentAdminGradePage} / ${totalPages} 페이지)`;

  const tbody = document.getElementById("admin-grade-list");
  const systemCodes = ["FREE", "ADMIN"];

  if (!pagedItems.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#64748b; padding:18px;">등록된 등급이 없습니다.</td></tr>`;
  } else {
    tbody.innerHTML = pagedItems.map(g => `
      <tr>
        <td><span class="tag">${g.code}</span></td>
        <td><b>${g.name}</b></td>
        <td>Lv.${g.level}</td>
        <td>${systemCodes.includes(g.code) ? `<small style="color:#64748b;">시스템 기본 등급</small>` : `<small style="color:#2563eb;">사용자 정의 등급</small>`}</td>
      </tr>
    `).join("");
  }

  document.getElementById("admin-grade-pagination").innerHTML = renderPaginationBar(currentAdminGradePage, totalPages, "renderAdminGradesPage");
}

async function saveModulePolicy(moduleId) {
  const custom_name = document.getElementById(`mod-name-${moduleId}`).value.trim();
  const custom_description = document.getElementById(`mod-desc-${moduleId}`).value.trim();
  const is_enabled = document.getElementById(`mod-en-${moduleId}`).value === "true";
  const access_type = document.getElementById(`mod-acc-${moduleId}`).value;
  const allowed_grades = document.getElementById(`mod-gr-${moduleId}`).value.split(",");

  const res = await fetch(`/api/v1/admin/modules/${moduleId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      custom_name,
      custom_description,
      is_enabled,
      access_type,
      allowed_grades
    })
  });
  if (!res.ok) return showMsg("도구 설정 저장 실패", true);

  const target = adminCachedModules.find(m => m.module_id === moduleId);
  if (target) {
    target.name = custom_name || target.default_name;
    target.description = custom_description || target.default_description;
    target.is_enabled = is_enabled;
    target.access_type = access_type;
    target.allowed_grades = allowed_grades.map(s => s.trim()).filter(Boolean);
  }
  showMsg("도구 제목·설명 및 승인 조건이 저장되었습니다.");
  await fetchToolsList();
  renderAdminModulesPage(currentAdminModPage);
}

async function handleCreateGrade(e) {
  e.preventDefault();
  const res = await fetch("/api/v1/admin/grades", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      code: document.getElementById("grade-code").value.trim().toUpperCase(),
      name: document.getElementById("grade-name").value.trim(),
      level: parseInt(document.getElementById("grade-level").value, 10)
    })
  });
  if (!res.ok) return showMsg("등급 생성 실패", true);
  e.target.reset();
  showMsg("새 등급이 생성되었습니다.");
  await loadAdminAndProfile("grades");
}

async function saveUserAdmin(userId) {
  const grade = document.getElementById(`u-gr-${userId}`).value;
  const is_active = document.getElementById(`u-ac-${userId}`).value === "true";
  const res = await fetch(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ grade, is_active })
  });
  if (!res.ok) return showMsg("회원 정보 저장 실패", true);

  const target = adminCachedUsers.find(u => u.id === userId);
  if (target) {
    target.grade = grade;
    target.is_active = is_active;
  }
  showMsg("회원 등급 및 상태가 저장되었습니다.");
  renderAdminUsersPage(currentAdminUserPage);
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