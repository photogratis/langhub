var adminCachedModules = [];
var adminCachedUsers = [];
var adminCachedGrades = [];
var adminCachedForbidden = [];
var currentAdminModPage = 1;
var currentAdminUserPage = 1;
var currentAdminGradePage = 1;
var currentAdminFnPage = 1;

async function initAdminView(initialTab = "profile") {
  if (!currentUser) return openBaseView("auth");

  renderMyProfileSummary();

  const isAdmin = currentUser.grade === "ADMIN";
  document.querySelectorAll(".admin-tab-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin);
  });

  if (!isAdmin) {
    switchAdminTab("profile");
    return;
  }

  const [modRes, gradeRes, userRes, fnRes] = await Promise.all([
    fetch("/api/v1/admin/modules", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/grades", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/users", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/admin/forbidden-nicknames", { headers: getAuthHeaders(false) })
  ]);

  adminCachedModules = modRes.ok ? await modRes.json() : [];
  adminCachedGrades = gradeRes.ok ? await gradeRes.json() : [];
  adminCachedUsers = userRes.ok ? await userRes.json() : [];
  adminCachedForbidden = fnRes.ok ? await fnRes.json() : [];

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

function renderMyProfileSummary() {
  const card = document.getElementById("my-profile-card");
  if (card) {
    card.innerHTML = `
      <div style="font-size:14px; line-height:1.8;">
        <div><b>닉네임:</b> ${currentUser.nickname}</div>
        <div><b>이메일:</b> ${currentUser.email}</div>
        <div><b>현재 등급:</b> <span class="tag">${currentUser.grade}</span></div>
      </div>
    `;
  }
  const nickInput = document.getElementById("profile-new-nickname");
  if (nickInput) nickInput.value = currentUser.nickname;
}

function switchAdminTab(tabName) {
  if (typeof clearMsg === "function") clearMsg();
  ["profile", "modules", "users", "grades", "forbidden"].forEach(t => {
    const sec = document.getElementById(`admin-sec-${t}`);
    const btn = document.getElementById(`btn-subtab-${t}`);
    if (sec) sec.classList.toggle("hidden", t !== tabName);
    if (btn) btn.classList.toggle("active", t === tabName);
  });

  if (tabName === "modules") renderAdminModulesPage(currentAdminModPage);
  if (tabName === "users") renderAdminUsersPage(currentAdminUserPage);
  if (tabName === "grades") renderAdminGradesPage(currentAdminGradePage);
  if (tabName === "forbidden") renderForbiddenNicknamesPage(currentAdminFnPage);
}

/* =========================================================
   [내 정보: 닉네임 변경 및 비밀번호 변경]
   ========================================================= */

async function handleUpdateMyNickname(e) {
  e.preventDefault();
  const nickname = document.getElementById("profile-new-nickname").value.trim();
  const res = await fetch("/api/v1/users/me/nickname", {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ nickname })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "닉네임 변경 실패", true);

  currentUser.nickname = data.nickname;
  renderMyProfileSummary();
  await checkCurrentUser();
  showMsg(data.message || "닉네임이 변경되었습니다.");
}

async function handleChangeMyPassword(e) {
  e.preventDefault();
  const current_password = document.getElementById("profile-cur-pw").value;
  const new_password = document.getElementById("profile-new-pw").value;
  const new_password_confirm = document.getElementById("profile-new-pw-confirm").value;

  if (new_password !== new_password_confirm) {
    return showMsg("새 비밀번호와 비밀번호 확인이 일치하지 않습니다.", true);
  }

  const res = await fetch("/api/v1/users/me/password", {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ current_password, new_password, new_password_confirm })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "비밀번호 변경 실패", true);

  e.target.reset();
  showMsg(data.message || "비밀번호가 변경되었습니다.");
}

/* =========================================================
   [관리자 탭 2~5: 모듈 / 회원 / 등급 / 금지 닉네임 관리]
   ========================================================= */

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

function renderForbiddenNicknamesPage(page = 1) {
  currentAdminFnPage = page;
  const keyword = (document.getElementById("admin-fn-search")?.value || "").trim().toLowerCase();
  const pageSize = 10;

  const filtered = adminCachedForbidden.filter(item =>
    !keyword ||
    (item.word || "").toLowerCase().includes(keyword) ||
    (item.reason || "").toLowerCase().includes(keyword)
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentAdminFnPage > totalPages) currentAdminFnPage = totalPages;

  const start = (currentAdminFnPage - 1) * pageSize;
  const pagedItems = filtered.slice(start, start + pageSize);

  document.getElementById("admin-fn-summary").innerHTML = `전체 <b>${total}</b>개 금지어 (${currentAdminFnPage} / ${totalPages} 페이지)`;

  const tbody = document.getElementById("admin-fn-list");
  if (!pagedItems.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#64748b; padding:18px;">등록된 금지 닉네임 단어가 없습니다.</td></tr>`;
  } else {
    tbody.innerHTML = pagedItems.map(item => `
      <tr>
        <td><span class="tag" style="background:#fee2e2; color:#991b1b;">${item.word}</span></td>
        <td>${item.reason || "-"}</td>
        <td><button class="danger" onclick="handleDeleteForbiddenNickname('${item.id}')">삭제</button></td>
      </tr>
    `).join("");
  }

  document.getElementById("admin-fn-pagination").innerHTML = renderPaginationBar(currentAdminFnPage, totalPages, "renderForbiddenNicknamesPage");
}

async function handleAddForbiddenNickname(e) {
  e.preventDefault();
  const word = document.getElementById("fn-word").value;
  const reason = document.getElementById("fn-reason").value;

  const res = await fetch("/api/v1/admin/forbidden-nicknames", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ word, reason })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "금지어 등록 실패", true);

  e.target.reset();
  adminCachedForbidden.unshift(data);
  showMsg("금지 닉네임 단어가 등록되었습니다.");
  renderForbiddenNicknamesPage(1);
}

async function handleDeleteForbiddenNickname(wordId) {
  const res = await fetch(`/api/v1/admin/forbidden-nicknames/${wordId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("금지어 삭제 실패", true);

  adminCachedForbidden = adminCachedForbidden.filter(item => item.id !== wordId);
  showMsg("금지어가 삭제되었습니다.");
  renderForbiddenNicknamesPage(currentAdminFnPage);
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
  await initAdminView("grades");
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