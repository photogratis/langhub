/* =========================================================
   static/js/shell.js
   - 전역 상태 관리 (currentUser, availableMenus, currentSiteLang)
   - 한국어(ko) / 인도네시아어(id) 다국어 전환 및 도구 디렉터리 렌더링
   - 동적 모듈 로더 (HTML + JS 자동 주입 및 초기화)
   - 코어 뷰(auth / admin) 로더 및 공통 유틸 함수
========================================================= */

var currentUser = null;
var availableMenus = [];
var activeModuleId = null;

// 현재 선택 언어 ('ko' 또는 'id')
var currentSiteLang =
  localStorage.getItem("site_lang") ||
  ((navigator.language || "").toLowerCase().startsWith("id") ? "id" : "ko");

const SHELL_I18N = {
  ko: {
    dir_title: "학습 도구 목록",
    dir_subtitle: "원하는 한국어·인도네시아어 학습 도구를 선택하세요.",
    search_placeholder: "도구 이름 또는 설명 검색...",
    open_tool_btn: "도구 열기",
    badge_public: "누구나 이용",
    badge_member: "회원 전용",
    badge_grade: "등급 제한",
    empty_tools: "표시할 학습 도구가 없습니다.",
    nav_tools: "학습 도구",
    nav_admin_staff: "관리자 · 내 정보",
    nav_admin_user: "내 정보",
    nav_login: "로그인 / 가입",
    nav_logout: "로그아웃",
    back_to_tools: "← 도구 목록으로",
    login_required_module: "이 도구를 사용하려면 로그인이 필요합니다.",
    grade_restricted_module: "현재 회원 등급으로는 접근할 수 없는 도구입니다.",
    module_load_error: "도구 화면을 불러오는 중 오류가 발생했습니다.",
    logged_out_msg: "로그아웃되었습니다.",
  },
  id: {
    dir_title: "Daftar Alat Belajar",
    dir_subtitle: "Pilih alat pembelajaran bahasa Korea & Indonesia yang ingin Anda gunakan.",
    search_placeholder: "Cari nama atau deskripsi alat...",
    open_tool_btn: "Buka Alat",
    badge_public: "Umum (Gratis)",
    badge_member: "Khusus Anggota",
    badge_grade: "Khusus Tingkat",
    empty_tools: "Tidak ada alat belajar yang tersedia.",
    nav_tools: "Alat Belajar",
    nav_admin_staff: "Admin · Profil",
    nav_admin_user: "Profil Saya",
    nav_login: "Masuk / Daftar",
    nav_logout: "Keluar",
    back_to_tools: "← Kembali ke Daftar Alat",
    login_required_module: "Silakan masuk terlebih dahulu untuk menggunakan alat ini.",
    grade_restricted_module: "Tingkat keanggotaan Anda tidak memiliki akses ke alat ini.",
    module_load_error: "Terjadi kesalahan saat memuat alat belajar.",
    logged_out_msg: "Anda telah keluar.",
  },
};

function tShell(key) {
  const dict = SHELL_I18N[currentSiteLang] || SHELL_I18N.ko;
  return dict[key] || SHELL_I18N.ko[key] || key;
}

/* =========================================================
   [공통 유틸: 인증 헤더 / 알림 메시지 / 페이지네이션]
========================================================= */
function getAuthHeaders(includeJson = true) {
  const headers = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  const token = localStorage.getItem("access_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function showMsg(text, isError = false) {
  const el = document.getElementById("global-msg");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "error");
  if (isError) el.classList.add("error");
}

function clearMsg() {
  const el = document.getElementById("global-msg");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
  el.classList.remove("error");
}

function renderPaginationBar(currentPage, totalPages, callbackFnName) {
  if (totalPages <= 1) return "";
  let html = `<div style="display:flex; justify-content:center; gap:6px; margin-top:14px; flex-wrap:wrap;">`;
  for (let p = 1; p <= totalPages; p++) {
    const isCurrent = p === currentPage;
    html += `
      <button type="button"
        class="${isCurrent ? "" : "secondary"}"
        style="padding:5px 10px; font-size:12.5px;"
        onclick="${callbackFnName}(${p})">
        ${p}
      </button>
    `;
  }
  html += `</div>`;
  return html;
}

/* =========================================================
   [다국어 전환 및 상단 헤더 업데이트]
========================================================= */
function setSiteLanguage(lang) {
  currentSiteLang = lang === "id" ? "id" : "ko";
  localStorage.setItem("site_lang", currentSiteLang);
  document.documentElement.lang = currentSiteLang;

  const sel = document.getElementById("site-lang-select");
  if (sel) sel.value = currentSiteLang;

  applyShellLanguage();
  renderToolsDirectory();

  // 현재 개별 모듈이 열려 있는 상태라면 상단 모듈 제목도 선택 언어로 갱신
  if (activeModuleId) {
    const menu = availableMenus.find(m => m.module_id === activeModuleId);
    const titleEl = document.getElementById("active-module-title");
    if (menu && titleEl) {
      titleEl.textContent =
        currentSiteLang === "id" ? menu.name_id || menu.name : menu.name;
    }
  }
}

function applyShellLanguage() {
  const textMap = {
    "nav-btn-tools": "nav_tools",
    "nav-btn-login": "nav_login",
    "nav-btn-logout": "nav_logout",
    "tools-dir-title": "dir_title",
    "tools-dir-subtitle": "dir_subtitle",
    "btn-back-to-tools": "back_to_tools",
    "btn-back-from-base": "back_to_tools",
  };
  Object.entries(textMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = tShell(key);
  });

  const adminBtn = document.getElementById("nav-btn-admin");
  if (adminBtn) {
    const isAdmin = currentUser && currentUser.grade === "ADMIN";
    adminBtn.textContent = isAdmin
      ? tShell("nav_admin_staff")
      : tShell("nav_admin_user");
  }

  const searchInput = document.getElementById("tools-dir-search");
  if (searchInput) searchInput.placeholder = tShell("search_placeholder");
}

/* =========================================================
   [로그인 사용자 상태 확인 & 로그아웃]
========================================================= */
async function checkCurrentUser() {
  const token = localStorage.getItem("access_token");
  if (!token) {
    currentUser = null;
    updateAuthNavUI();
    return null;
  }

  try {
    const res = await fetch("/api/v1/auth/me", {
      headers: getAuthHeaders(false),
    });
    if (res.ok) {
      currentUser = await res.json();
    } else {
      localStorage.removeItem("access_token");
      currentUser = null;
    }
  } catch (e) {
    currentUser = null;
  }

  updateAuthNavUI();
  return currentUser;
}

function updateAuthNavUI() {
  const badgeEl = document.getElementById("nav-user-badge");
  const adminBtn = document.getElementById("nav-btn-admin");
  const logoutBtn = document.getElementById("nav-btn-logout");
  const loginBtn = document.getElementById("nav-btn-login");

  if (currentUser) {
    if (badgeEl) {
      badgeEl.textContent = `${currentUser.nickname} (${currentUser.grade})`;
      badgeEl.classList.remove("hidden");
    }
    if (adminBtn) {
      adminBtn.classList.remove("hidden");
      adminBtn.textContent =
        currentUser.grade === "ADMIN"
          ? tShell("nav_admin_staff")
          : tShell("nav_admin_user");
    }
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (loginBtn) loginBtn.classList.add("hidden");
  } else {
    if (badgeEl) badgeEl.classList.add("hidden");
    if (adminBtn) adminBtn.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
    if (loginBtn) loginBtn.classList.remove("hidden");
  }
}

async function handleLogout() {
  localStorage.removeItem("access_token");
  currentUser = null;
  updateAuthNavUI();
  await fetchToolsList();
  await openToolsDirectory();
  showMsg(tShell("logged_out_msg"));
}

/* =========================================================
   [도구 목록 API 조회 및 다국어 디렉터리 렌더링]
========================================================= */
async function fetchToolsList() {
  try {
    const res = await fetch("/api/v1/modules/menu", {
      headers: getAuthHeaders(false),
    });
    if (res.ok) {
      availableMenus = await res.json();
    } else {
      availableMenus = [];
    }
  } catch (e) {
    console.error("메뉴 로드 오류:", e);
    availableMenus = [];
  }
  return availableMenus;
}

function hideAllShellSections() {
  document.getElementById("view-tools-directory")?.classList.add("hidden");
  document.getElementById("view-module-runner")?.classList.add("hidden");
  document.getElementById("view-base-container")?.classList.add("hidden");
}

async function openToolsDirectory() {
  clearMsg();
  activeModuleId = null;
  hideAllShellSections();
  document.getElementById("view-tools-directory")?.classList.remove("hidden");

  if (!availableMenus.length) {
    await fetchToolsList();
  }
  renderToolsDirectory();
}

function renderToolsDirectory() {
  const container = document.getElementById("tools-directory-list");
  if (!container) return;

  const keyword = (document.getElementById("tools-dir-search")?.value || "")
    .trim()
    .toLowerCase();
  const isId = currentSiteLang === "id";

  const filtered = (availableMenus || []).filter(m => {
    const title = isId ? m.name_id || m.name : m.name;
    const desc = isId ? m.description_id || m.description : m.description;
    return (
      !keyword ||
      (title || "").toLowerCase().includes(keyword) ||
      (desc || "").toLowerCase().includes(keyword) ||
      (m.module_id || "").toLowerCase().includes(keyword)
    );
  });

  if (!filtered.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:28px; grid-column:1/-1;">${tShell("empty_tools")}</p>`;
    return;
  }

  container.innerHTML = filtered
    .map(m => {
      const displayTitle = isId ? m.name_id || m.name : m.name;
      const displayDesc = isId
        ? m.description_id || m.description
        : m.description;

      let accessLabel = tShell("badge_public");
      let badgeStyle = "background:#dcfce7; color:#166534;";
      if (m.access_type === "MEMBER") {
        accessLabel = tShell("badge_member");
        badgeStyle = "background:#dbeafe; color:#1e40af;";
      } else if (m.access_type === "GRADE") {
        accessLabel = tShell("badge_grade");
        badgeStyle = "background:#fef3c7; color:#92400e;";
      }

      return `
        <div class="tool-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:10px;">
              <strong style="font-size:17px; color:#0f172a; line-height:1.35;">${displayTitle}</strong>
              <span class="tag" style="font-size:11.5px; white-space:nowrap; ${badgeStyle}">${accessLabel}</span>
            </div>
            <p style="font-size:13.5px; color:#475569; margin:0; line-height:1.55;">
              ${displayDesc || ""}
            </p>
          </div>
          <button type="button" style="width:100%; padding:10px;" onclick="openModule('${m.module_id}')">
            ${tShell("open_tool_btn")}
          </button>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   [스크립트 동적 로더 유틸]
========================================================= */
function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dynamic-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${src}?v=${Date.now()}`;
    script.dataset.dynamicSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

/* =========================================================
   [개별 학습 모듈 실행기]
========================================================= */
async function openModule(moduleId) {
  clearMsg();
  if (!availableMenus.length) {
    await fetchToolsList();
  }

  const menu = availableMenus.find(m => m.module_id === moduleId);
  if (!menu) {
    return showMsg(tShell("module_load_error"), true);
  }

  // 비회원 접근 제한 사전 안내
  if ((menu.access_type === "MEMBER" || menu.access_type === "GRADE") && !currentUser) {
    showMsg(tShell("login_required_module"), true);
    return openBaseView("auth");
  }

  activeModuleId = moduleId;
  hideAllShellSections();
  document.getElementById("view-module-runner")?.classList.remove("hidden");

  const titleEl = document.getElementById("active-module-title");
  if (titleEl) {
    titleEl.textContent =
      currentSiteLang === "id" ? menu.name_id || menu.name : menu.name;
  }

  const mountEl = document.getElementById("module-mount-area");
  const ui = menu.ui || {};
  const assetMod = ui.asset_module || moduleId;
  const htmlFile = ui.html || "widget.html";
  const jsFiles = Array.isArray(ui.js) ? ui.js : ui.js ? [ui.js] : ["widget.js"];

  try {
    const htmlRes = await fetch(`/static/modules/${assetMod}/${htmlFile}?v=${Date.now()}`);
    if (!htmlRes.ok) throw new Error("Widget HTML not found");
    mountEl.innerHTML = await htmlRes.text();

    for (const jsFile of jsFiles) {
      await loadScriptOnce(`/static/modules/${assetMod}/${jsFile}`);
    }

    if (ui.init_fn && typeof window[ui.init_fn] === "function") {
      await window[ui.init_fn](moduleId);
    }
  } catch (err) {
    console.error(err);
    mountEl.innerHTML = `<p style="color:#b91c1c; padding:20px;">${tShell("module_load_error")}</p>`;
  }
}

/* =========================================================
   [코어 기본 뷰 로더 (auth / admin)]
========================================================= */
async function openBaseView(pkgName) {
  clearMsg();
  activeModuleId = null;
  hideAllShellSections();
  document.getElementById("view-base-container")?.classList.remove("hidden");

  const mountEl = document.getElementById("base-mount-area");
  try {
    const htmlRes = await fetch(`/static/base/${pkgName}/${pkgName}.html?v=${Date.now()}`);
    if (!htmlRes.ok) throw new Error(`${pkgName}.html not found`);
    mountEl.innerHTML = await htmlRes.text();

    await loadScriptOnce(`/static/base/${pkgName}/${pkgName}.js`);

    if (pkgName === "auth" && typeof initAuthView === "function") {
      initAuthView();
    } else if (pkgName === "admin" && typeof initAdminView === "function") {
      await initAdminView("profile");
    }
  } catch (err) {
    console.error(err);
    mountEl.innerHTML = `<p style="color:#b91c1c; padding:20px;">화면을 불러오지 못했습니다.</p>`;
  }
}

/* =========================================================
   [앱 최초 초기화]
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const sel = document.getElementById("site-lang-select");
  if (sel) sel.value = currentSiteLang;
  document.documentElement.lang = currentSiteLang;

  applyShellLanguage();
  await checkCurrentUser();
  await fetchToolsList();
  await openToolsDirectory();
});