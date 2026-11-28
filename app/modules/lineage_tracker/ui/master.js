var lnMasterData = {
  is_lineage_admin: false,
  servers: [],
  clans: [],
  accounts: [],
  characters: [],
};

var lnMCharPage = 1;
var lnMAccPage = 1;
var lnMClanPage = 1;
var lnMSrvPage = 1;

var editingMCharId = null;
var editingMAccId = null;
var editingMClanId = null;
var editingMSrvId = null;

async function initLineageMasterModule() {
  clearMsg();
  editingMCharId = null;
  editingMAccId = null;
  editingMClanId = null;
  editingMSrvId = null;
  await reloadLineageMasterData();
  switchLineageMasterTab("characters");
}

async function reloadLineageMasterData() {
  const res = await fetch("/api/v1/modules/lineage_tracker/bootstrap", {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showMsg(err.detail || "관리자 권한이 필요합니다.", true);
    return;
  }
  const data = await res.json();
  lnMasterData.is_lineage_admin = Boolean(data.is_lineage_admin);
  lnMasterData.servers = data.servers || [];
  lnMasterData.clans = data.clans || [];
  lnMasterData.accounts = data.accounts || [];
  lnMasterData.characters = data.characters || [];

  populateMasterSelectors();
  renderMasterCharsPage(lnMCharPage);
  renderMasterAccsPage(lnMAccPage);
  renderMasterClansPage(lnMClanPage);
  renderMasterSrvsPage(lnMSrvPage);
}

function populateMasterSelectors() {
  const srvEl = document.getElementById("ln-m-char-server");
  if (srvEl) {
    srvEl.innerHTML = lnMasterData.servers
      .map(s => `<option value="${s.id}">${s.server_name}</option>`)
      .join("");
  }
  const accEl = document.getElementById("ln-m-char-account");
  if (accEl) {
    accEl.innerHTML = lnMasterData.accounts
      .map(a => `<option value="${a.id}">${a.account_name}</option>`)
      .join("");
  }
  const clanEl = document.getElementById("ln-m-char-clan");
  if (clanEl) {
    clanEl.innerHTML =
      `<option value="">(혈맹 없음 / 선택 안 함)</option>` +
      lnMasterData.clans
        .map(c => `<option value="${c.id}">🏰 ${c.clan_name}</option>`)
        .join("");
  }
}

function switchLineageMasterTab(tabName) {
  clearMsg();
  ["characters", "accounts", "clans", "servers"].forEach(t => {
    const btn = document.getElementById(`ln-m-tab-${t}`);
    const view = document.getElementById(`ln-m-view-${t}`);
    if (btn) btn.className = t === tabName ? "" : "secondary";
    if (view) view.classList.toggle("hidden", t !== tabName);
  });
}

/* =========================================================
   1. 캐릭터 관리 (검색 + 페이지네이션 + CRUD)
========================================================= */
function renderMasterCharsPage(page = 1) {
  lnMCharPage = page;
  const kw = (document.getElementById("ln-m-char-search")?.value || "").trim().toLowerCase();
  const pageSize = parseInt(document.getElementById("ln-m-char-pagesize")?.value || "10", 10);

  const filtered = lnMasterData.characters.filter(ch => {
    if (!kw) return true;
    const srv = (ch.lineage_servers?.server_name || "").toLowerCase();
    const acc = (ch.lineage_accounts?.account_name || "").toLowerCase();
    const clan = (ch.lineage_clans?.clan_name || "").toLowerCase();
    const name = (ch.character_name || "").toLowerCase();
    return name.includes(kw) || srv.includes(kw) || acc.includes(kw) || clan.includes(kw);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnMCharPage > totalPages) lnMCharPage = totalPages;

  const start = (lnMCharPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-m-char-summary");
  if (sumEl) sumEl.innerHTML = `전체 <b>${total}</b>개 캐릭터 (${lnMCharPage} / ${totalPages} 페이지)`;

  const listEl = document.getElementById("ln-m-char-list");
  if (!listEl) return;

  listEl.innerHTML = paged.length
    ? paged.map(ch => {
        const srv = ch.lineage_servers?.server_name || "서버미지정";
        const acc = ch.lineage_accounts?.account_name || "계정미지정";
        const clan = ch.lineage_clans?.clan_name
          ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8;">🏰 ${ch.lineage_clans.clan_name}</span>`
          : `<span style="color:#94a3b8; font-size:12px;">혈맹없음</span>`;
        return `
          <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <div>
              <span class="pos-badge">🌐 ${srv}</span>
              <strong style="font-size:15px; margin-left:6px;">${ch.character_name}</strong>
              <span style="color:#475569; font-size:13px; margin-left:6px;">(🔑 ${acc})</span>
              ${clan}
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startMasterEditChar('${ch.id}')">수정</button>
              <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteMasterChar('${ch.id}')">삭제</button>
            </div>
          </div>
        `;
      }).join("")
    : `<p style="color:#64748b; text-align:center; padding:20px;">조건에 맞는 캐릭터가 없습니다.</p>`;

  document.getElementById("ln-m-char-pagination").innerHTML =
    renderPaginationBar(lnMCharPage, totalPages, "renderMasterCharsPage");
}

function startMasterEditChar(id) {
  const ch = lnMasterData.characters.find(c => String(c.id) === String(id));
  if (!ch) return;
  editingMCharId = ch.id;
  document.getElementById("ln-m-char-server").value = ch.server_id || "";
  document.getElementById("ln-m-char-account").value = ch.account_id || "";
  document.getElementById("ln-m-char-name").value = ch.character_name || "";
  document.getElementById("ln-m-char-clan").value = ch.clan_id || "";
  document.getElementById("ln-m-char-form-title").textContent = "✏️ 캐릭터 수정 중";
  document.getElementById("ln-m-char-submit-btn").textContent = "수정 저장";
  document.getElementById("ln-m-char-submit-btn").style.background = "#d97706";
  document.getElementById("ln-m-char-cancel-btn").classList.remove("hidden");
}

function cancelMasterEditChar() {
  editingMCharId = null;
  document.getElementById("ln-m-char-name").value = "";
  document.getElementById("ln-m-char-clan").value = "";
  document.getElementById("ln-m-char-form-title").textContent = "➕ 새 캐릭터 등록";
  document.getElementById("ln-m-char-submit-btn").textContent = "캐릭터 저장";
  document.getElementById("ln-m-char-submit-btn").style.background = "";
  document.getElementById("ln-m-char-cancel-btn").classList.add("hidden");
}

async function handleMasterSaveChar(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    server_id: document.getElementById("ln-m-char-server").value,
    account_id: document.getElementById("ln-m-char-account").value,
    character_name: document.getElementById("ln-m-char-name").value.trim(),
    clan_id: document.getElementById("ln-m-char-clan").value || null,
  };
  const url = editingMCharId
    ? `/api/v1/modules/lineage_tracker/characters/${editingMCharId}`
    : "/api/v1/modules/lineage_tracker/characters";
  const res = await fetch(url, {
    method: editingMCharId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "캐릭터 저장 실패", true);

  cancelMasterEditChar();
  showMsg("캐릭터 정보가 저장되었습니다.");
  await reloadLineageMasterData();
}

async function deleteMasterChar(id) {
  if (!confirm("이 캐릭터를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/characters/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "캐릭터 삭제 실패", true);
  if (editingMCharId === id) cancelMasterEditChar();
  showMsg("캐릭터가 삭제되었습니다.");
  await reloadLineageMasterData();
}

/* =========================================================
   2. 게임 계정 관리 (검색 + 페이지네이션 + CRUD)
========================================================= */
function renderMasterAccsPage(page = 1) {
  lnMAccPage = page;
  const kw = (document.getElementById("ln-m-acc-search")?.value || "").trim().toLowerCase();
  const pageSize = parseInt(document.getElementById("ln-m-acc-pagesize")?.value || "10", 10);

  const filtered = lnMasterData.accounts.filter(a =>
    !kw ||
    (a.account_name || "").toLowerCase().includes(kw) ||
    (a.memo || "").toLowerCase().includes(kw)
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnMAccPage > totalPages) lnMAccPage = totalPages;

  const start = (lnMAccPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-m-acc-summary");
  if (sumEl) sumEl.innerHTML = `전체 <b>${total}</b>개 계정 (${lnMAccPage} / ${totalPages} 페이지)`;

  const listEl = document.getElementById("ln-m-acc-list");
  if (!listEl) return;

  listEl.innerHTML = paged.length
    ? paged.map(a => `
        <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong style="font-size:15px;">🔑 ${a.account_name}</strong>
            ${a.memo ? `<span style="color:#64748b; font-size:13px; margin-left:8px;">(${a.memo})</span>` : ""}
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startMasterEditAcc('${a.id}')">수정</button>
            <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteMasterAcc('${a.id}')">삭제</button>
          </div>
        </div>
      `).join("")
    : `<p style="color:#64748b; text-align:center; padding:20px;">조건에 맞는 계정이 없습니다.</p>`;

  document.getElementById("ln-m-acc-pagination").innerHTML =
    renderPaginationBar(lnMAccPage, totalPages, "renderMasterAccsPage");
}

function startMasterEditAcc(id) {
  const item = lnMasterData.accounts.find(a => String(a.id) === String(id));
  if (!item) return;
  editingMAccId = item.id;
  document.getElementById("ln-m-acc-name").value = item.account_name || "";
  document.getElementById("ln-m-acc-memo").value = item.memo || "";
  document.getElementById("ln-m-acc-form-title").textContent = "✏️ 게임 계정 수정 중";
  document.getElementById("ln-m-acc-submit-btn").textContent = "수정 저장";
  document.getElementById("ln-m-acc-submit-btn").style.background = "#d97706";
  document.getElementById("ln-m-acc-cancel-btn").classList.remove("hidden");
}

function cancelMasterEditAcc() {
  editingMAccId = null;
  document.getElementById("ln-m-acc-name").value = "";
  document.getElementById("ln-m-acc-memo").value = "";
  document.getElementById("ln-m-acc-form-title").textContent = "➕ 새 게임 계정 등록";
  document.getElementById("ln-m-acc-submit-btn").textContent = "계정 저장";
  document.getElementById("ln-m-acc-submit-btn").style.background = "";
  document.getElementById("ln-m-acc-cancel-btn").classList.add("hidden");
}

async function handleMasterSaveAcc(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    account_name: document.getElementById("ln-m-acc-name").value.trim(),
    memo: document.getElementById("ln-m-acc-memo").value.trim(),
  };
  const url = editingMAccId
    ? `/api/v1/modules/lineage_tracker/accounts/${editingMAccId}`
    : "/api/v1/modules/lineage_tracker/accounts";
  const res = await fetch(url, {
    method: editingMAccId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "계정 저장 실패", true);

  cancelMasterEditAcc();
  showMsg("계정 정보가 저장되었습니다.");
  await reloadLineageMasterData();
}

async function deleteMasterAcc(id) {
  if (!confirm("이 게임 계정을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/accounts/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "계정 삭제 실패", true);
  if (editingMAccId === id) cancelMasterEditAcc();
  showMsg("계정이 삭제되었습니다.");
  await reloadLineageMasterData();
}

/* =========================================================
   3. 혈맹 관리 (검색 + 페이지네이션 + CRUD)
========================================================= */
function renderMasterClansPage(page = 1) {
  lnMClanPage = page;
  const kw = (document.getElementById("ln-m-clan-search")?.value || "").trim().toLowerCase();
  const pageSize = parseInt(document.getElementById("ln-m-clan-pagesize")?.value || "10", 10);

  const filtered = lnMasterData.clans.filter(c =>
    !kw ||
    (c.clan_name || "").toLowerCase().includes(kw) ||
    (c.description || "").toLowerCase().includes(kw)
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnMClanPage > totalPages) lnMClanPage = totalPages;

  const start = (lnMClanPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-m-clan-summary");
  if (sumEl) sumEl.innerHTML = `전체 <b>${total}</b>개 혈맹 (${lnMClanPage} / ${totalPages} 페이지)`;

  const listEl = document.getElementById("ln-m-clan-list");
  if (!listEl) return;

  listEl.innerHTML = paged.length
    ? paged.map(c => `
        <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong style="font-size:15px;">🏰 ${c.clan_name}</strong>
            ${c.description ? `<span style="color:#64748b; font-size:13px; margin-left:8px;">(${c.description})</span>` : ""}
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startMasterEditClan('${c.id}')">수정</button>
            <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteMasterClan('${c.id}')">삭제</button>
          </div>
        </div>
      `).join("")
    : `<p style="color:#64748b; text-align:center; padding:20px;">조건에 맞는 혈맹이 없습니다.</p>`;

  document.getElementById("ln-m-clan-pagination").innerHTML =
    renderPaginationBar(lnMClanPage, totalPages, "renderMasterClansPage");
}

function startMasterEditClan(id) {
  const item = lnMasterData.clans.find(c => String(c.id) === String(id));
  if (!item) return;
  editingMClanId = item.id;
  document.getElementById("ln-m-clan-name").value = item.clan_name || "";
  document.getElementById("ln-m-clan-desc").value = item.description || "";
  document.getElementById("ln-m-clan-form-title").textContent = "✏️ 혈맹 수정 중";
  document.getElementById("ln-m-clan-submit-btn").textContent = "수정 저장";
  document.getElementById("ln-m-clan-submit-btn").style.background = "#d97706";
  document.getElementById("ln-m-clan-cancel-btn").classList.remove("hidden");
}

function cancelMasterEditClan() {
  editingMClanId = null;
  document.getElementById("ln-m-clan-name").value = "";
  document.getElementById("ln-m-clan-desc").value = "";
  document.getElementById("ln-m-clan-form-title").textContent = "➕ 새 혈맹 등록";
  document.getElementById("ln-m-clan-submit-btn").textContent = "혈맹 저장";
  document.getElementById("ln-m-clan-submit-btn").style.background = "";
  document.getElementById("ln-m-clan-cancel-btn").classList.add("hidden");
}

async function handleMasterSaveClan(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    clan_name: document.getElementById("ln-m-clan-name").value.trim(),
    description: document.getElementById("ln-m-clan-desc").value.trim(),
  };
  const url = editingMClanId
    ? `/api/v1/modules/lineage_tracker/clans/${editingMClanId}`
    : "/api/v1/modules/lineage_tracker/clans";
  const res = await fetch(url, {
    method: editingMClanId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "혈맹 저장 실패", true);

  cancelMasterEditClan();
  showMsg("혈맹 정보가 저장되었습니다.");
  await reloadLineageMasterData();
}

async function deleteMasterClan(id) {
  if (!confirm("이 혈맹을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/clans/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "혈맹 삭제 실패", true);
  if (editingMClanId === id) cancelMasterEditClan();
  showMsg("혈맹이 삭제되었습니다.");
  await reloadLineageMasterData();
}

/* =========================================================
   4. 서버 관리 (검색 + 페이지네이션 + CRUD)
========================================================= */
function renderMasterSrvsPage(page = 1) {
  lnMSrvPage = page;
  const kw = (document.getElementById("ln-m-srv-search")?.value || "").trim().toLowerCase();
  const pageSize = parseInt(document.getElementById("ln-m-srv-pagesize")?.value || "10", 10);

  const filtered = lnMasterData.servers.filter(s =>
    !kw ||
    (s.server_name || "").toLowerCase().includes(kw) ||
    (s.description || "").toLowerCase().includes(kw)
  );

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnMSrvPage > totalPages) lnMSrvPage = totalPages;

  const start = (lnMSrvPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-m-srv-summary");
  if (sumEl) sumEl.innerHTML = `전체 <b>${total}</b>개 서버 (${lnMSrvPage} / ${totalPages} 페이지)`;

  const listEl = document.getElementById("ln-m-srv-list");
  if (!listEl) return;

  listEl.innerHTML = paged.length
    ? paged.map(s => `
        <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong style="font-size:15px;">🌐 ${s.server_name}</strong>
            ${s.description ? `<span style="color:#64748b; font-size:13px; margin-left:8px;">(${s.description})</span>` : ""}
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startMasterEditSrv('${s.id}')">수정</button>
            <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteMasterSrv('${s.id}')">삭제</button>
          </div>
        </div>
      `).join("")
    : `<p style="color:#64748b; text-align:center; padding:20px;">조건에 맞는 서버가 없습니다.</p>`;

  document.getElementById("ln-m-srv-pagination").innerHTML =
    renderPaginationBar(lnMSrvPage, totalPages, "renderMasterSrvsPage");
}

function startMasterEditSrv(id) {
  const item = lnMasterData.servers.find(s => String(s.id) === String(id));
  if (!item) return;
  editingMSrvId = item.id;
  document.getElementById("ln-m-srv-name").value = item.server_name || "";
  document.getElementById("ln-m-srv-desc").value = item.description || "";
  document.getElementById("ln-m-srv-form-title").textContent = "✏️ 서버 수정 중";
  document.getElementById("ln-m-srv-submit-btn").textContent = "수정 저장";
  document.getElementById("ln-m-srv-submit-btn").style.background = "#d97706";
  document.getElementById("ln-m-srv-cancel-btn").classList.remove("hidden");
}

function cancelMasterEditSrv() {
  editingMSrvId = null;
  document.getElementById("ln-m-srv-name").value = "";
  document.getElementById("ln-m-srv-desc").value = "";
  document.getElementById("ln-m-srv-form-title").textContent = "➕ 새 서버 등록";
  document.getElementById("ln-m-srv-submit-btn").textContent = "서버 저장";
  document.getElementById("ln-m-srv-submit-btn").style.background = "";
  document.getElementById("ln-m-srv-cancel-btn").classList.add("hidden");
}

async function handleMasterSaveSrv(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    server_name: document.getElementById("ln-m-srv-name").value.trim(),
    description: document.getElementById("ln-m-srv-desc").value.trim(),
  };
  const url = editingMSrvId
    ? `/api/v1/modules/lineage_tracker/servers/${editingMSrvId}`
    : "/api/v1/modules/lineage_tracker/servers";
  const res = await fetch(url, {
    method: editingMSrvId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "서버 저장 실패", true);

  cancelMasterEditSrv();
  showMsg("서버 정보가 저장되었습니다.");
  await reloadLineageMasterData();
}

async function deleteMasterSrv(id) {
  if (!confirm("이 서버를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/servers/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "서버 삭제 실패", true);
  if (editingMSrvId === id) cancelMasterEditSrv();
  showMsg("서버가 삭제되었습니다.");
  await reloadLineageMasterData();
}