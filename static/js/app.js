let currentUser = null;
let currentDictModule = "ko_id_dict";
let loadedDictWords = [];
let editingDictWordId = null;

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

function showView(viewName) {
  document.getElementById("message").className = "msg";
  ["dict", "grammar", "analyzer", "auth", "admin"].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("hidden", v !== viewName);
  });
  if (viewName === "dict") searchDictionary();
  if (viewName === "admin") loadAdminAndProfile();
}

function toggleAuthForm(type) {
  document.getElementById("login-form").classList.toggle("hidden", type !== "login");
  document.getElementById("signup-form").classList.toggle("hidden", type !== "signup");
}

async function loadPublicMenu() {
  const menuBar = document.getElementById("dynamic-menu-bar");
  try {
    const res = await fetch("/api/v1/modules/menu");
    if (!res.ok) return [];
    const menus = await res.json();
    const labelMap = { PUBLIC: "누구나", MEMBER: "회원전용", GRADE: "등급제한" };

    menuBar.innerHTML = menus.map(m => `
      <button class="menu-btn" onclick="openModule('${m.module_id}')">
        ${m.name} <span class="menu-badge">${labelMap[m.access_type] || m.access_type}</span>
      </button>
    `).join("");
    return menus;
  } catch {
    return [];
  }
}

function openModule(moduleId) {
  if (moduleId === "ko_grammar_dict") {
    return openGrammarModule();
  }
  if (moduleId === "hangul_analyzer") {
    return openAnalyzerModule();
  }
  cancelEditDictWord();
  currentDictModule = moduleId;
  const isKoId = moduleId === "ko_id_dict";
  document.getElementById("dict-title").textContent = isKoId ? "한국어 - 인도네시아어 사전" : "인도네시아어 - 한국어 사전";
  document.getElementById("lbl-word").textContent = isKoId ? "한국어 표제어" : "인도네시아어 표제어";
  document.getElementById("lbl-meaning").textContent = isKoId ? "인도네시아어 뜻" : "한국어 뜻";
  document.getElementById("lbl-ex1").textContent = isKoId ? "예문 (한국어)" : "예문 (인도네시아어)";
  document.getElementById("lbl-ex2").textContent = isKoId ? "예문 번역 (인도네시아어)" : "예문 해석 (한국어)";
  showView("dict");
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
  if (currentUser) {
    navRight.innerHTML = `
      <span style="font-size:13px;">${currentUser.nickname} (${currentUser.grade})</span>
      <button class="menu-btn" onclick="showView('admin')">마이페이지 / 관리</button>
      <button class="menu-btn" onclick="handleLogout()">로그아웃</button>
    `;
    document.getElementById("dict-admin-add").classList.toggle("hidden", currentUser.grade !== "ADMIN");
  } else {
    navRight.innerHTML = `<button class="menu-btn" onclick="showView('auth')">로그인 / 회원가입</button>`;
    document.getElementById("dict-admin-add").classList.add("hidden");
  }
}

async function searchDictionary(e) {
  if (e) e.preventDefault();
  const q = document.getElementById("search-q").value;
  const tag = document.getElementById("search-tag").value;
  const params = new URLSearchParams();
  if (q) params.append("q", q);
  if (tag) params.append("tag", tag);

  const container = document.getElementById("dict-results");
  const res = await fetch(`/api/v1/modules/${currentDictModule}/words?${params.toString()}`, {
    headers: getAuthHeaders(false)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    container.innerHTML = `<div style="padding:24px; text-align:center; color:#b91c1c; background:#fef2f2; border-radius:8px;">
      <b>접근 제한 또는 오류 (${res.status}):</b> ${err.detail || "이 모듈을 사용할 수 없습니다."}
    </div>`;
    return;
  }

  loadedDictWords = await res.json();
  if (!loadedDictWords.length) {
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
  searchDictionary();
}

async function deleteDictWord(id) {
  if (editingDictWordId === id) cancelEditDictWord();
  await fetch(`/api/v1/modules/${currentDictModule}/words/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  searchDictionary();
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
  openModule(currentDictModule);
  showMsg("로그인되었습니다.");
}

function handleLogout() {
  localStorage.removeItem("access_token");
  checkCurrentUser();
  openModule(currentDictModule);
  showMsg("로그아웃 되었습니다.");
}

async function loadAdminAndProfile() {
  if (!currentUser) return showView("auth");
  document.getElementById("my-profile-card").innerHTML = `
    <b>내 정보:</b> ${currentUser.nickname} (${currentUser.email}) — <b>등급:</b> ${currentUser.grade}
  `;

  const adminPanel = document.getElementById("admin-only-panel");
  if (currentUser.grade !== "ADMIN") {
    adminPanel.classList.add("hidden");
    return;
  }
  adminPanel.classList.remove("hidden");

  const [modRes, gradeRes, userRes] = await Promise.all([
    fetch("/api/v1/admin/modules", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/grades", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/users", { headers: getAuthHeaders(false) })
  ]);

  const modules = await modRes.json();
  const grades = await gradeRes.json();
  const users = await userRes.json();

  document.getElementById("admin-module-list").innerHTML = modules.map(m => `
    <tr>
      <td><b>${m.name}</b><br/><small>${m.module_id}</small></td>
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

  document.getElementById("admin-user-list").innerHTML = users.map(u => `
    <tr>
      <td>${u.email}</td>
      <td>${u.nickname}</td>
      <td>
        <select id="u-gr-${u.id}">
          ${grades.map(g => `<option value="${g.code}" ${u.grade === g.code ? "selected" : ""}>${g.name} (${g.code})</option>`).join("")}
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

async function saveModulePolicy(moduleId) {
  const is_enabled = document.getElementById(`mod-en-${moduleId}`).value === "true";
  const access_type = document.getElementById(`mod-acc-${moduleId}`).value;
  const allowed_grades = document.getElementById(`mod-gr-${moduleId}`).value.split(",");

  const res = await fetch(`/api/v1/admin/modules/${moduleId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ is_enabled, access_type, allowed_grades })
  });
  if (!res.ok) return showMsg("모듈 권한 저장 실패", true);
  showMsg("모듈 승인 조건이 업데이트되었습니다.");
  await loadPublicMenu();
}

async function handleCreateGrade(e) {
  e.preventDefault();
  const res = await fetch("/api/v1/admin/grades", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      code: document.getElementById("grade-code").value,
      name: document.getElementById("grade-name").value,
      level: parseInt(document.getElementById("grade-level").value, 10)
    })
  });
  if (!res.ok) return showMsg("등급 생성 실패", true);
  e.target.reset();
  showMsg("새 등급이 생성되었습니다.");
  loadAdminAndProfile();
}

async function saveUserAdmin(userId) {
  const grade = document.getElementById(`u-gr-${userId}`).value;
  const is_active = document.getElementById(`u-ac-${userId}`).value === "true";
  await fetch(`/api/v1/admin/users/${userId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ grade, is_active })
  });
  showMsg("회원 등급이 저장되었습니다.");
}

(async function init() {
  await checkCurrentUser();
  const menus = await loadPublicMenu();
  const defaultMod = menus.find(m => m.module_id === "ko_id_dict") ? "ko_id_dict" : (menus[0]?.module_id || "id_ko_dict");
  openModule(defaultMod);
})();