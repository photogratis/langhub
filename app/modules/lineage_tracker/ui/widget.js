var lnBootstrap = {
  is_lineage_admin: false,
  servers: [],
  clans: [],
  accounts: [],
  characters: [],
  items: [],
  npcs: [],
};
var lnActiveSession = null;
var lnAllInventories = [];

// 관리자 수정 모드 ID 상태
var editingLnServerId = null;
var editingLnClanId = null;
var editingLnAccountId = null;
var editingLnCharacterId = null;
var editingLnItemId = null;
var editingLnNpcId = null;

function toLocalDatetimeInputValue(dateObj = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}T${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

function fmtNum(val) {
  return Number(val || 0).toLocaleString("ko-KR");
}

function fmtIdr(val) {
  return "Rp " + Number(val || 0).toLocaleString("id-ID");
}

async function initLineageTrackerModule() {
  clearMsg();
  await reloadLineageBootstrap();

  // 기본 정산 조회 기간 (이번 달 1일 ~ 오늘)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const startEl = document.getElementById("ln-pay-start");
  const endEl = document.getElementById("ln-pay-end");
  if (startEl && !startEl.value) startEl.value = firstDay.toISOString().slice(0, 10);
  if (endEl && !endEl.value) endEl.value = today.toISOString().slice(0, 10);

  switchLineageTab("play");
}

async function reloadLineageBootstrap() {
  const res = await fetch("/api/v1/modules/lineage_tracker/bootstrap", {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showMsg(err.detail || "LINEAGE 등급 접근 권한이 필요합니다.", true);
    return;
  }
  lnBootstrap = await res.json();

  document.querySelectorAll(".ln-admin-only").forEach(el => {
    el.classList.toggle("hidden", !lnBootstrap.is_lineage_admin);
  });

  populateLineageSelectors();
  renderAdminMasterLists();
  renderPublicNpcDirectory();
}

function populateLineageSelectors() {
  const serverOpts = lnBootstrap.servers
    .map(s => `<option value="${s.id}">${s.server_name}</option>`)
    .join("");

  const clanOptsOptional =
    `<option value="">(혈맹 없음 / 선택 안 함)</option>` +
    lnBootstrap.clans
      .map(c => `<option value="${c.id}">🏰 ${c.clan_name}</option>`)
      .join("");

  const accountOpts = lnBootstrap.accounts
    .map(a => `<option value="${a.id}">${a.account_name}</option>`)
    .join("");

  const charOpts = lnBootstrap.characters
    .map(ch => {
      const srv = ch.lineage_servers?.server_name || "서버미지정";
      const acc = ch.lineage_accounts?.account_name || "계정미지정";
      const clan = ch.lineage_clans?.clan_name ? ` · 🏰${ch.lineage_clans.clan_name}` : "";
      return `<option value="${ch.id}">[${srv}] ${acc} / ${ch.character_name}${clan}</option>`;
    })
    .join("");

  const itemOpts = lnBootstrap.items
    .map(it => `<option value="${it.id}">${it.item_name} (${fmtNum(it.adena_unit_price)} 아데나)</option>`)
    .join("");

  const npcOptsOptional =
    `<option value="">(직접 입력 / 기준단가 사용)</option>` +
    (lnBootstrap.npcs || [])
      .map(n => `<option value="${n.id}">[${n.town_name}] ${n.npc_name} (${n.business_type})</option>`)
      .join("");

  const srvEl = document.getElementById("ln-char-server");
  if (srvEl) srvEl.innerHTML = serverOpts;

  const accEl = document.getElementById("ln-char-account");
  if (accEl) accEl.innerHTML = accountOpts;

  ["ln-tx-clan", "ln-adj-clan", "ln-char-clan"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = clanOptsOptional;
  });

  ["ln-start-char", "ln-tx-char", "ln-adj-char"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = charOpts;
  });

  ["ln-tx-item", "ln-adj-item"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = itemOpts;
  });

  const txNpcEl = document.getElementById("ln-tx-npc");
  if (txNpcEl) txNpcEl.innerHTML = npcOptsOptional;
}

function switchLineageTab(tabName) {
  clearMsg();
  ["play", "storage", "npcs", "history", "admin"].forEach(t => {
    const btn = document.getElementById(`ln-tab-${t}`);
    const view = document.getElementById(`ln-view-${t}`);
    if (btn) {
      btn.className = t === tabName
        ? (t === "admin" ? "ln-admin-only" : "")
        : (t === "admin" ? "secondary ln-admin-only" : "secondary");
    }
    if (view) view.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "play") {
    loadPlaySessionView();
  } else if (tabName === "storage") {
    onChangeTxCharacter();
    loadLineageTransactionsAndLogs();
  } else if (tabName === "npcs") {
    renderPublicNpcDirectory();
  } else if (tabName === "history") {
    loadPlaySessionsHistory();
    loadMyIdrPayouts();
  } else if (tabName === "admin") {
    renderAdminMasterLists();
    loadWorkerPayoutSummary();
  }
}

/* =========================================================
   아이템 행 동적 추가 유틸
========================================================= */
function addLineageItemRow(containerId, presetItemId = "", presetQty = 0) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const row = document.createElement("div");
  row.className = "ln-item-row";
  row.style.cssText = "display:flex; gap:8px; align-items:center; margin-bottom:6px;";

  const options = lnBootstrap.items
    .map(it => `<option value="${it.id}" ${String(it.id) === String(presetItemId) ? "selected" : ""}>${it.item_name} (${fmtNum(it.adena_unit_price)} 아데나)</option>`)
    .join("");

  row.innerHTML = `
    <select class="ln-row-item" style="flex:2;">${options}</select>
    <input type="number" class="ln-row-qty" min="0" value="${presetQty}" placeholder="수량" style="flex:1;" />
    <button type="button" style="background:#ef4444; padding:6px 10px;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(row);
}

function collectLineageItemRows(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .ln-item-row`);
  const result = [];
  rows.forEach(r => {
    const item_id = r.querySelector(".ln-row-item")?.value;
    const quantity = parseInt(r.querySelector(".ln-row-qty")?.value || "0", 10);
    if (item_id && quantity >= 0) {
      result.push({ item_id, quantity });
    }
  });
  return result;
}

/* =========================================================
   탭 1: 게임 세션 시작 / 종료
========================================================= */
async function loadPlaySessionView() {
  const res = await fetch("/api/v1/modules/lineage_tracker/sessions/active", {
    headers: getAuthHeaders(false),
  });
  lnActiveSession = res.ok ? await res.json() : null;

  const activeBox = document.getElementById("ln-active-session-box");
  const startBox = document.getElementById("ln-start-session-box");

  if (lnActiveSession) {
    activeBox.classList.remove("hidden");
    startBox.classList.add("hidden");

    const ch = lnActiveSession.lineage_characters || {};
    const srvName = ch.lineage_servers?.server_name || "";
    const accName = ch.lineage_accounts?.account_name || "";
    document.getElementById("ln-active-char-badge").textContent =
      `[${srvName}] ${accName} - ${ch.character_name || ""}`;
    document.getElementById("ln-active-start-summary").innerHTML =
      `시작 시각: <b>${new Date(lnActiveSession.started_at).toLocaleString()}</b> · ` +
      `시작 레벨: <b>Lv.${lnActiveSession.start_level}</b> (${lnActiveSession.start_exp}%)`;

    document.getElementById("ln-end-time").value = toLocalDatetimeInputValue();
    document.getElementById("ln-end-level").value = lnActiveSession.start_level;
    document.getElementById("ln-end-exp").value = lnActiveSession.start_exp;

    const endList = document.getElementById("ln-end-items-list");
    endList.innerHTML = "";
    const invRes = await fetch(
      `/api/v1/modules/lineage_tracker/inventories?character_id=${lnActiveSession.character_id}`,
      { headers: getAuthHeaders(false) }
    );
    const invs = invRes.ok ? await invRes.json() : [];
    const charInvs = invs.filter(i => i.storage_type === "CHARACTER");
    if (charInvs.length) {
      charInvs.forEach(i => addLineageItemRow("ln-end-items-list", i.item_id, i.quantity));
    } else {
      addLineageItemRow("ln-end-items-list");
    }
  } else {
    activeBox.classList.add("hidden");
    startBox.classList.remove("hidden");
    document.getElementById("ln-start-time").value = toLocalDatetimeInputValue();
    onSelectStartCharacter();
  }
}

async function onSelectStartCharacter() {
  const charId = document.getElementById("ln-start-char")?.value;
  if (!charId) return;

  const ch = lnBootstrap.characters.find(c => String(c.id) === String(charId));
  if (ch) {
    document.getElementById("ln-start-level").value = ch.current_level || 1;
    document.getElementById("ln-start-exp").value = ch.current_exp || 0;
  }

  const startList = document.getElementById("ln-start-items-list");
  startList.innerHTML = "";

  const invRes = await fetch(
    `/api/v1/modules/lineage_tracker/inventories?character_id=${charId}`,
    { headers: getAuthHeaders(false) }
  );
  const invs = invRes.ok ? await invRes.json() : [];
  const charInvs = invs.filter(i => i.storage_type === "CHARACTER");
  if (charInvs.length) {
    charInvs.forEach(i => addLineageItemRow("ln-start-items-list", i.item_id, i.quantity));
  } else {
    addLineageItemRow("ln-start-items-list");
  }
}

async function handleStartLineageSession(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    character_id: document.getElementById("ln-start-char").value,
    started_at: new Date(document.getElementById("ln-start-time").value).toISOString(),
    start_level: parseInt(document.getElementById("ln-start-level").value, 10),
    start_exp: parseFloat(document.getElementById("ln-start-exp").value),
    start_items: collectLineageItemRows("ln-start-items-list"),
  };

  const res = await fetch("/api/v1/modules/lineage_tracker/sessions/start", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "게임 시작 기록 실패", true);

  showMsg("게임 시작 기록이 저장되었습니다!");
  loadPlaySessionView();
}

async function handleEndLineageSession(e) {
  e.preventDefault();
  if (!lnActiveSession) return;
  clearMsg();

  const payload = {
    ended_at: new Date(document.getElementById("ln-end-time").value).toISOString(),
    end_level: parseInt(document.getElementById("ln-end-level").value, 10),
    end_exp: parseFloat(document.getElementById("ln-end-exp").value),
    end_items: collectLineageItemRows("ln-end-items-list"),
  };

  const res = await fetch(`/api/v1/modules/lineage_tracker/sessions/${lnActiveSession.id}/end`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "종료 기록 저장 실패", true);

  if (data.has_discrepancy) {
    showMsg(`종료 저장 완료 (⚠️ 수량 불일치 감지됨: ${data.discrepancy_note})`, true);
  } else {
    showMsg(`종료 완료! 순수익 ${fmtNum(data.net_earned_adena)} 아데나 (시간당 ${fmtNum(data.hourly_earned_adena)} 아데나)`);
  }
  loadPlaySessionView();
}

/* =========================================================
   탭 2: 개인/혈맹 창고 입출고 & 판매/이전 (NPC 매입가 자동 반영)
========================================================= */
function onChangeTxCharacter() {
  const charId = document.getElementById("ln-tx-char")?.value;
  const ch = lnBootstrap.characters.find(c => String(c.id) === String(charId));
  const clanSel = document.getElementById("ln-tx-clan");
  if (ch && clanSel) {
    clanSel.value = ch.clan_id || "";
  }
  loadAllInventoriesView();
}

function toggleTxSaleField() {
  const t = document.getElementById("ln-tx-type")?.value;
  const isSell = t === "SELL";
  document.getElementById("ln-tx-sale-box")?.classList.toggle("hidden", !isSell);
  document.getElementById("ln-tx-npc-box")?.classList.toggle("hidden", !isSell);
  if (isSell) recalcTxNpcSalePrice();
}

function recalcTxNpcSalePrice() {
  const t = document.getElementById("ln-tx-type")?.value;
  if (t !== "SELL") return;

  const npcId = document.getElementById("ln-tx-npc")?.value;
  const itemId = document.getElementById("ln-tx-item")?.value;
  const qty = parseInt(document.getElementById("ln-tx-qty")?.value || "0", 10);
  const saleInput = document.getElementById("ln-tx-sale-adena");
  if (!saleInput || !itemId || qty <= 0) return;

  let unitPrice = 0;
  if (npcId) {
    const npc = (lnBootstrap.npcs || []).find(n => String(n.id) === String(npcId));
    const buySpec = (npc?.lineage_npc_items || []).find(
      ni => String(ni.item_id) === String(itemId) && ni.trade_direction === "BUY_FROM_PLAYER"
    );
    if (buySpec) {
      unitPrice = Number(buySpec.price_adena || 0);
    }
  }
  if (!unitPrice) {
    const itemMeta = lnBootstrap.items.find(i => String(i.id) === String(itemId));
    unitPrice = Number(itemMeta?.adena_unit_price || 0);
  }
  saleInput.value = Math.round(unitPrice * qty);
}

async function handleCreateLineageTransaction(e) {
  e.preventDefault();
  clearMsg();
  const txType = document.getElementById("ln-tx-type").value;
  const saleRaw = document.getElementById("ln-tx-sale-adena").value;

  const payload = {
    session_id: lnActiveSession ? lnActiveSession.id : null,
    character_id: document.getElementById("ln-tx-char").value,
    clan_id: document.getElementById("ln-tx-clan").value || null,
    npc_id: txType === "SELL" ? (document.getElementById("ln-tx-npc").value || null) : null,
    tx_type: txType,
    item_id: document.getElementById("ln-tx-item").value,
    quantity: parseInt(document.getElementById("ln-tx-qty").value, 10),
    sale_total_adena: txType === "SELL" && saleRaw !== "" ? parseFloat(saleRaw) : null,
    note: document.getElementById("ln-tx-note").value.trim(),
  };

  const res = await fetch("/api/v1/modules/lineage_tracker/transactions", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "창고/판매 처리 실패", true);

  document.getElementById("ln-tx-qty").value = "";
  document.getElementById("ln-tx-sale-adena").value = "";
  document.getElementById("ln-tx-note").value = "";
  showMsg("창고 이동 / 판매 기록이 반영되었습니다.");
  loadAllInventoriesView();
  loadLineageTransactionsAndLogs();
}

async function loadAllInventoriesView() {
  const charId = document.getElementById("ln-tx-char")?.value || "";
  const clanId = document.getElementById("ln-tx-clan")?.value || "";

  const params = new URLSearchParams();
  if (charId) params.append("character_id", charId);
  if (clanId) params.append("clan_id", clanId);

  const res = await fetch(`/api/v1/modules/lineage_tracker/inventories?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  lnAllInventories = res.ok ? await res.json() : [];

  const renderBox = (elId, list, emptyText = "보유 아이템 없음") => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<span style="color:#94a3b8;">${emptyText}</span>`;
      return;
    }
    el.innerHTML = list
      .map(i => {
        const meta = i.lineage_items || {};
        const val = Number(i.quantity || 0) * Number(meta.adena_unit_price || 0);
        return `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #e2e8f0;">
          <span><b>${meta.item_name || "-"}</b></span>
          <span>${fmtNum(i.quantity)}개 <small style="color:#64748b;">(${fmtNum(val)} 아데나)</small></span>
        </div>`;
      })
      .join("");
  };

  renderBox("ln-inv-character", lnAllInventories.filter(i => i.storage_type === "CHARACTER"));
  renderBox("ln-inv-personal", lnAllInventories.filter(i => i.storage_type === "PERSONAL"));
  renderBox(
    "ln-inv-clan",
    clanId ? lnAllInventories.filter(i => i.storage_type === "CLAN") : [],
    clanId ? "혈맹창고 보유 아이템 없음" : "혈맹을 선택하면 혈맹창고 재고가 표시됩니다."
  );
}

async function loadLineageTransactionsAndLogs() {
  const txLabels = {
    TO_PERSONAL: "개인창고 입고",
    FROM_PERSONAL: "개인창고 출고",
    TO_CLAN: "혈맹창고 입고",
    FROM_CLAN: "혈맹창고 출고",
    SELL: "아이템 판매",
    TRADE_OUT: "외부 이전",
  };

  const [txRes, adjRes] = await Promise.all([
    fetch("/api/v1/modules/lineage_tracker/transactions", { headers: getAuthHeaders(false) }),
    fetch("/api/v1/modules/lineage_tracker/admin/adjustments", { headers: getAuthHeaders(false) }),
  ]);

  const txList = txRes.ok ? await txRes.json() : [];
  const adjList = adjRes.ok ? await adjRes.json() : [];

  const txEl = document.getElementById("ln-tx-history-list");
  if (txEl) {
    txEl.innerHTML = txList.length
      ? txList.slice(0, 20).map(t => `
          <div class="word-card" style="background:#fff; padding:8px 10px; margin-bottom:6px; font-size:12.5px;">
            <span class="tag">${txLabels[t.tx_type] || t.tx_type}</span>
            <b>${t.lineage_items?.item_name || "-"}</b> ${fmtNum(t.quantity)}개
            (${fmtNum(t.adena_value)} 아데나)
            <div style="color:#64748b; margin-top:2px;">
              ${t.user_nickname} · ${t.lineage_characters?.character_name || ""} · ${new Date(t.created_at).toLocaleString()}
              ${t.note ? ` · 메모: ${t.note}` : ""}
            </div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:13px;">이동/판매 기록이 없습니다.</p>`;
  }

  const adjEl = document.getElementById("ln-adj-history-list");
  if (adjEl) {
    adjEl.innerHTML = adjList.length
      ? adjList.slice(0, 20).map(a => `
          <div class="word-card" style="background:#fff5f5; border-color:#fecaca; padding:8px 10px; margin-bottom:6px; font-size:12.5px;">
            <span class="tag" style="background:#dc2626; color:#fff;">${a.storage_type} 보정</span>
            <b>${a.lineage_items?.item_name || "-"}</b>: ${fmtNum(a.before_qty)} → <b>${fmtNum(a.after_qty)}</b> (${a.diff_qty >= 0 ? "+" : ""}${fmtNum(a.diff_qty)})
            <div style="color:#7f1d1d; margin-top:2px;">사유: ${a.reason}</div>
            <div style="color:#64748b;">관리자: ${a.admin_nickname} · ${new Date(a.created_at).toLocaleString()}</div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:13px;">수량 보정 이력이 없습니다.</p>`;
  }
}

/* =========================================================
   탭 3: NPC 상점 · 매입/판매 시세 안내 (전체 회원 조회)
========================================================= */
function renderPublicNpcDirectory() {
  const container = document.getElementById("ln-public-npcs-directory");
  if (!container) return;

  const kw = (document.getElementById("ln-npc-search")?.value || "").trim().toLowerCase();
  const npcs = (lnBootstrap.npcs || []).filter(n => {
    if (!kw) return true;
    const itemNames = (n.lineage_npc_items || [])
      .map(ni => ni.lineage_items?.item_name || "")
      .join(" ")
      .toLowerCase();
    return (
      (n.town_name || "").toLowerCase().includes(kw) ||
      (n.npc_name || "").toLowerCase().includes(kw) ||
      (n.business_type || "").toLowerCase().includes(kw) ||
      (n.memo || "").toLowerCase().includes(kw) ||
      itemNames.includes(kw)
    );
  });

  if (!npcs.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px;">등록된 NPC 정보가 없습니다.</p>`;
    return;
  }

  container.innerHTML = npcs.map(n => {
    const allItems = n.lineage_npc_items || [];
    const sellItems = allItems.filter(i => i.trade_direction === "SELL_TO_PLAYER");
    const buyItems = allItems.filter(i => i.trade_direction === "BUY_FROM_PLAYER");

    const sellHtml = sellItems.length
      ? sellItems.map(i => `
          <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed #e2e8f0; font-size:12.5px;">
            <span>${i.lineage_items?.item_name || "-"}</span>
            <b style="color:#2563eb;">${fmtNum(i.price_adena)} 아데나</b>
          </div>
        `).join("")
      : `<span style="color:#94a3b8; font-size:12px;">판매 물품 없음</span>`;

    const buyHtml = buyItems.length
      ? buyItems.map(i => `
          <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px dashed #e2e8f0; font-size:12.5px;">
            <span>${i.lineage_items?.item_name || "-"}</span>
            <b style="color:#16a34a;">${fmtNum(i.price_adena)} 아데나</b>
          </div>
        `).join("")
      : `<span style="color:#94a3b8; font-size:12px;">매입 물품 없음</span>`;

    return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <div>
            <span class="pos-badge">🏘️ ${n.town_name}</span>
            <span class="tag" style="margin-left:4px;">${n.business_type}</span>
            <strong style="font-size:15px; margin-left:6px;">${n.npc_name}</strong>
            ${n.memo ? `<small style="color:#64748b; margin-left:8px;">(${n.memo})</small>` : ""}
          </div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
          <div style="background:#eff6ff; padding:8px 10px; border-radius:6px;">
            <div style="font-weight:700; font-size:12.5px; color:#1d4ed8; margin-bottom:4px;">🛒 NPC 판매물품 및 가격 (구매처)</div>
            ${sellHtml}
          </div>
          <div style="background:#f0fdf4; padding:8px 10px; border-radius:6px;">
            <div style="font-weight:700; font-size:12.5px; color:#15803d; margin-bottom:4px;">💰 NPC 매입물품 및 가격 (판매처)</div>
            ${buyHtml}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   탭 4: 플레이 내역 & 내 IDR 급여 지급 기록
========================================================= */
async function loadPlaySessionsHistory() {
  const res = await fetch("/api/v1/modules/lineage_tracker/sessions", {
    headers: getAuthHeaders(false),
  });
  const list = res.ok ? await res.json() : [];
  const el = document.getElementById("ln-sessions-list");
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p style="color:#64748b;">아직 기록된 플레이 내역이 없습니다.</p>`;
    return;
  }

  el.innerHTML = list.map(s => {
    const ch = s.lineage_characters || {};
    const srv = ch.lineage_servers?.server_name || "";
    const acc = ch.lineage_accounts?.account_name || "";
    const statusBadge = s.status === "PLAYING"
      ? `<span class="tag" style="background:#f59e0b; color:#fff;">진행 중</span>`
      : (s.has_discrepancy
          ? `<span class="tag" style="background:#dc2626; color:#fff;">⚠️ 수량불일치</span>`
          : `<span class="tag" style="background:#16a34a; color:#fff;">정산완료</span>`);

    return `
      <div class="word-card" style="background:#fff; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            ${statusBadge}
            <strong style="margin-left:6px;">${s.user_nickname}</strong>
            <span style="color:#475569; margin-left:4px;">([${srv}] ${acc} - ${ch.character_name || ""})</span>
          </div>
          <div style="font-size:13.5px;">
            순수익: <b style="color:#2563eb;">${fmtNum(s.net_earned_adena)} 아데나</b> ·
            시간당: <b style="color:#16a34a;">${fmtNum(s.hourly_earned_adena)} 아데나/h</b>
            (${s.duration_minutes}분)
          </div>
        </div>
        <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
          시작: ${new Date(s.started_at).toLocaleString()} (Lv.${s.start_level} / ${s.start_exp}%)
          ${s.ended_at ? ` → 종료: ${new Date(s.ended_at).toLocaleString()} (Lv.${s.end_level} / ${s.end_exp}%)` : ""}
        </div>
        ${s.has_discrepancy ? `<div style="font-size:12px; color:#b91c1c; margin-top:4px;">⚠️ ${s.discrepancy_note}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function loadMyIdrPayouts() {
  const res = await fetch("/api/v1/modules/lineage_tracker/payouts", {
    headers: getAuthHeaders(false),
  });
  const list = res.ok ? await res.json() : [];
  const el = document.getElementById("ln-my-payouts-list");
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p style="color:#64748b;">급여 지급 내역이 없습니다.</p>`;
    return;
  }

  el.innerHTML = list.map(p => `
    <div class="word-card" style="background:#f0fdf4; border-color:#bbf7d0; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <span class="tag" style="background:#15803d; color:#fff;">IDR 지급완료</span>
          <strong style="margin-left:6px;">${p.worker_nickname}</strong>
          <span style="font-size:12.5px; color:#475569; margin-left:6px;">(${p.period_start} ~ ${p.period_end})</span>
        </div>
        <div style="font-size:15px; font-weight:800; color:#15803d;">
          실지급액: ${fmtIdr(p.total_paid_idr)}
        </div>
      </div>
      <div style="font-size:12.5px; color:#334155; margin-top:4px;">
        총 플레이: <b>${(p.total_play_minutes / 60).toFixed(2)}시간</b> ·
        총 획득: <b>${fmtNum(p.total_earned_adena)} 아데나</b> (평균 <b>${fmtNum(p.avg_hourly_adena)} 아데나/h</b>) ·
        책정 시급: <b>${fmtIdr(p.hourly_rate_idr)}/h</b> (보너스: ${fmtIdr(p.bonus_idr)})
      </div>
      <div style="font-size:12px; color:#64748b; margin-top:2px;">
        지급수단: ${p.payment_method} · 처리자: ${p.paid_by_admin_name} (${new Date(p.paid_at).toLocaleString()})
        ${p.payment_note ? ` · 메모: ${p.payment_note}` : ""}
      </div>
    </div>
  `).join("");
}

/* =========================================================
   탭 5: LINEAGE_ADMIN 전용 (보정 / IDR 정산 / 독립 마스터 CRUD)
========================================================= */
function toggleAdjustTargetFields() {
  const st = document.getElementById("ln-adj-storage-type")?.value;
  document.getElementById("ln-adj-char-box")?.classList.toggle("hidden", st === "CLAN");
  document.getElementById("ln-adj-clan-box")?.classList.toggle("hidden", st !== "CLAN");
}

async function handleAdminAdjustInventory(e) {
  e.preventDefault();
  clearMsg();
  const st = document.getElementById("ln-adj-storage-type").value;
  const payload = {
    storage_type: st,
    character_id: st !== "CLAN" ? document.getElementById("ln-adj-char").value : null,
    clan_id: st === "CLAN" ? document.getElementById("ln-adj-clan").value : null,
    item_id: document.getElementById("ln-adj-item").value,
    after_qty: parseInt(document.getElementById("ln-adj-after-qty").value, 10),
    reason: document.getElementById("ln-adj-reason").value.trim(),
  };

  const res = await fetch("/api/v1/modules/lineage_tracker/admin/adjust-inventory", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "보정 처리 실패", true);

  document.getElementById("ln-adj-after-qty").value = "";
  document.getElementById("ln-adj-reason").value = "";
  showMsg("수량 보정이 완료되었으며 감사 로그에 영구 기록되었습니다.");
}

async function loadWorkerPayoutSummary() {
  const start = document.getElementById("ln-pay-start")?.value;
  const end = document.getElementById("ln-pay-end")?.value;
  if (!start || !end) return;

  const res = await fetch(
    `/api/v1/modules/lineage_tracker/payouts/summary?period_start=${start}&period_end=${end}`,
    { headers: getAuthHeaders(false) }
  );
  const list = res.ok ? await res.json() : [];
  const el = document.getElementById("ln-worker-summary-list");
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `<p style="color:#64748b; font-size:13px;">해당 기간에 종료된 플레이 기록이 없습니다.</p>`;
    return;
  }

  el.innerHTML = list.map((w, idx) => `
    <div class="word-card" style="background:#fff; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div>
          <strong style="font-size:15px;">👤 ${w.worker_nickname}</strong>
          <span style="font-size:12.5px; color:#475569; margin-left:6px;">
            (${w.session_count}회 플레이 · 총 <b>${w.total_play_hours}시간</b>)
          </span>
          ${w.discrepancy_count > 0 ? `<span class="tag" style="background:#dc2626; color:#fff; margin-left:4px;">불일치 ${w.discrepancy_count}건</span>` : ""}
        </div>
        <div style="font-size:13.5px;">
          총 획득: <b>${fmtNum(w.total_earned_adena)} 아데나</b> ·
          시간당 평균: <b style="color:#16a34a; font-size:15px;">${fmtNum(w.avg_hourly_adena)} 아데나/h</b>
        </div>
      </div>

      <div class="row" style="align-items:flex-end; background:#f8fafc; padding:8px; border-radius:6px;">
        <div>
          <label>책정 시간당 급여 (IDR / 시간)</label>
          <input type="number" id="ln-rate-idr-${idx}" value="15000" min="0" step="500" oninput="recalcWorkerIdrPreview(${idx}, ${w.total_play_hours})" />
        </div>
        <div>
          <label>성과 보너스 (IDR)</label>
          <input type="number" id="ln-bonus-idr-${idx}" value="0" min="0" step="1000" oninput="recalcWorkerIdrPreview(${idx}, ${w.total_play_hours})" />
        </div>
        <div>
          <label>지급 수단 / 메모</label>
          <input type="text" id="ln-note-idr-${idx}" placeholder="예: BCA 이체 / GoPay" />
        </div>
        <div>
          <div id="ln-preview-idr-${idx}" style="font-weight:800; color:#15803d; margin-bottom:6px; font-size:14px;">
            예상 지급액: ${fmtIdr(Math.round(w.total_play_hours * 15000))}
          </div>
          <button type="button" style="background:#15803d; width:100%;" onclick='submitWorkerIdrPayout(${idx}, ${JSON.stringify(w)})'>
            💸 IDR 지급 확정 기록
          </button>
        </div>
      </div>
    </div>
  `).join("");
}

function recalcWorkerIdrPreview(idx, hours) {
  const rate = parseFloat(document.getElementById(`ln-rate-idr-${idx}`)?.value || "0");
  const bonus = parseFloat(document.getElementById(`ln-bonus-idr-${idx}`)?.value || "0");
  const total = Math.round((hours * rate) + bonus);
  const el = document.getElementById(`ln-preview-idr-${idx}`);
  if (el) el.textContent = `예상 지급액: ${fmtIdr(total)}`;
}

async function submitWorkerIdrPayout(idx, workerObj) {
  const start = document.getElementById("ln-pay-start").value;
  const end = document.getElementById("ln-pay-end").value;
  const rate = parseFloat(document.getElementById(`ln-rate-idr-${idx}`).value || "0");
  const bonus = parseFloat(document.getElementById(`ln-bonus-idr-${idx}`).value || "0");
  const note = document.getElementById(`ln-note-idr-${idx}`).value.trim();

  if (!confirm(`${workerObj.worker_nickname}님에게 루피아(IDR) 급여 지급을 확정 기록하시겠습니까?`)) return;

  const payload = {
    worker_user_id: workerObj.worker_user_id,
    worker_nickname: workerObj.worker_nickname,
    period_start: start,
    period_end: end,
    total_play_minutes: workerObj.total_play_minutes,
    total_earned_adena: workerObj.total_earned_adena,
    avg_hourly_adena: workerObj.avg_hourly_adena,
    hourly_rate_idr: rate,
    bonus_idr: bonus,
    payment_method: "IDR 송금/E-Wallet",
    payment_note: note,
  };

  const res = await fetch("/api/v1/modules/lineage_tracker/payouts", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "지급 기록 저장 실패", true);

  showMsg(`${workerObj.worker_nickname}님 지급 기록(${fmtIdr(data.total_paid_idr)})이 저장되었습니다.`);
}

/* =========================================================
   독립 마스터 6종 리스트 렌더링 & 등록/수정/삭제
========================================================= */
function renderAdminMasterLists() {
  // 1. 서버 목록
  const srvListEl = document.getElementById("ln-admin-servers-list");
  if (srvListEl) {
    srvListEl.innerHTML = lnBootstrap.servers.length
      ? lnBootstrap.servers.map(s => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; font-size:13px;">
            <div>
              <b>🌐 ${s.server_name}</b>
              ${s.description ? `<small style="color:#64748b; margin-left:6px;">${s.description}</small>` : ""}
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" style="background:#0284c7; padding:3px 7px; font-size:11.5px;" onclick="startEditServer('${s.id}')">수정</button>
              <button type="button" class="danger" style="padding:3px 7px; font-size:11.5px;" onclick="deleteLineageServer('${s.id}')">삭제</button>
            </div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 서버가 없습니다.</p>`;
  }

  // 2. 혈맹 목록
  const clanListEl = document.getElementById("ln-admin-clans-list");
  if (clanListEl) {
    clanListEl.innerHTML = lnBootstrap.clans.length
      ? lnBootstrap.clans.map(c => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; font-size:13px;">
            <div>
              <b>🏰 ${c.clan_name}</b>
              ${c.description ? `<small style="color:#64748b; margin-left:6px;">${c.description}</small>` : ""}
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" style="background:#0284c7; padding:3px 7px; font-size:11.5px;" onclick="startEditClan('${c.id}')">수정</button>
              <button type="button" class="danger" style="padding:3px 7px; font-size:11.5px;" onclick="deleteLineageClan('${c.id}')">삭제</button>
            </div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 혈맹이 없습니다. (혈맹 없이도 운영 가능)</p>`;
  }

  // 3. 계정 목록
  const accListEl = document.getElementById("ln-admin-accounts-list");
  if (accListEl) {
    accListEl.innerHTML = lnBootstrap.accounts.length
      ? lnBootstrap.accounts.map(a => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; font-size:13px;">
            <div>
              <b>🔑 ${a.account_name}</b>
              ${a.memo ? `<small style="color:#64748b; margin-left:6px;">${a.memo}</small>` : ""}
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" style="background:#0284c7; padding:3px 7px; font-size:11.5px;" onclick="startEditAccount('${a.id}')">수정</button>
              <button type="button" class="danger" style="padding:3px 7px; font-size:11.5px;" onclick="deleteLineageAccount('${a.id}')">삭제</button>
            </div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 계정이 없습니다.</p>`;
  }

  // 4. 캐릭터 목록
  const charListEl = document.getElementById("ln-admin-characters-list");
  if (charListEl) {
    charListEl.innerHTML = lnBootstrap.characters.length
      ? lnBootstrap.characters.map(ch => {
          const srv = ch.lineage_servers?.server_name || "서버미지정";
          const acc = ch.lineage_accounts?.account_name || "계정미지정";
          const clan = ch.lineage_clans?.clan_name
            ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8; font-size:11px;">🏰 ${ch.lineage_clans.clan_name}</span>`
            : `<span style="color:#94a3b8; font-size:11.5px;">혈맹없음</span>`;
          return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; font-size:13px; gap:6px;">
              <div>
                <span class="pos-badge">${srv}</span>
                <b style="margin-left:4px;">${ch.character_name}</b>
                <small style="color:#475569; margin-left:4px;">(${acc})</small>
                ${clan}
              </div>
              <div style="display:flex; gap:4px; flex-shrink:0;">
                <button type="button" style="background:#0284c7; padding:3px 7px; font-size:11.5px;" onclick="startEditCharacter('${ch.id}')">수정</button>
                <button type="button" class="danger" style="padding:3px 7px; font-size:11.5px;" onclick="deleteLineageCharacter('${ch.id}')">삭제</button>
              </div>
            </div>
          `;
        }).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 캐릭터가 없습니다.</p>`;
  }

  // 5. 아이템 단가 목록
  const itemListEl = document.getElementById("ln-admin-items-list");
  if (itemListEl) {
    itemListEl.innerHTML = lnBootstrap.items.length
      ? lnBootstrap.items.map(it => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 4px; border-bottom:1px solid #f1f5f9; font-size:13px;">
            <div>
              <span class="tag">${it.category || "기타"}</span>
              <b style="margin-left:4px;">${it.item_name}</b>
              <span style="color:#2563eb; font-weight:700; margin-left:8px;">${fmtNum(it.adena_unit_price)} 아데나</span>
            </div>
            <div style="display:flex; gap:4px;">
              <button type="button" style="background:#0284c7; padding:3px 7px; font-size:11.5px;" onclick="startEditItem('${it.id}')">수정</button>
              ${it.item_name !== "아데나" ? `<button type="button" class="danger" style="padding:3px 7px; font-size:11.5px;" onclick="deleteLineageItem('${it.id}')">삭제</button>` : ""}
            </div>
          </div>
        `).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 아이템이 없습니다.</p>`;
  }

  // 6. NPC 목록 및 각 NPC별 판매물품/매입물품 관리 카드
  const npcListEl = document.getElementById("ln-admin-npcs-list");
  if (npcListEl) {
    const itemOpts = lnBootstrap.items
      .filter(i => i.item_name !== "아데나")
      .map(i => `<option value="${i.id}">${i.item_name}</option>`)
      .join("");

    npcListEl.innerHTML = (lnBootstrap.npcs || []).length
      ? lnBootstrap.npcs.map(n => {
          const allItems = n.lineage_npc_items || [];
          const sellItems = allItems.filter(i => i.trade_direction === "SELL_TO_PLAYER");
          const buyItems = allItems.filter(i => i.trade_direction === "BUY_FROM_PLAYER");

          const renderSubList = (arr, color) => arr.length
            ? arr.map(ni => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 0; border-bottom:1px dashed #e2e8f0; font-size:12.5px;">
                  <span>${ni.lineage_items?.item_name || "-"} (<b style="color:${color};">${fmtNum(ni.price_adena)} 아데나</b>)</span>
                  <button type="button" class="danger" style="padding:1px 6px; font-size:11px;" onclick="deleteLineageNpcItem('${ni.id}')">✕</button>
                </div>
              `).join("")
            : `<span style="color:#94a3b8; font-size:12px;">등록된 품목 없음</span>`;

          return `
            <div class="word-card" style="background:#f8fafc; margin-bottom:10px; padding:10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                <div>
                  <span class="pos-badge">🏘️ ${n.town_name}</span>
                  <span class="tag" style="margin-left:4px;">${n.business_type}</span>
                  <strong style="margin-left:6px; font-size:14.5px;">${n.npc_name}</strong>
                  ${n.memo ? `<small style="color:#64748b; margin-left:6px;">${n.memo}</small>` : ""}
                </div>
                <div style="display:flex; gap:4px;">
                  <button type="button" style="background:#0284c7; padding:3px 8px; font-size:11.5px;" onclick="startEditNpc('${n.id}')">정보 수정</button>
                  <button type="button" class="danger" style="padding:3px 8px; font-size:11.5px;" onclick="deleteLineageNpc('${n.id}')">NPC 삭제</button>
                </div>
              </div>

              <!-- 품목 추가 인라인 폼 -->
              <form onsubmit="handleAddNpcItem(event, '${n.id}')" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; background:#fff; padding:6px 8px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:8px;">
                <select id="ln-npc-dir-${n.id}" style="flex:1.2; min-width:140px;">
                  <option value="SELL_TO_PLAYER">🛒 NPC 판매물품 (유저가 구매)</option>
                  <option value="BUY_FROM_PLAYER">💰 NPC 매입물품 (유저가 판매)</option>
                </select>
                <select id="ln-npc-item-${n.id}" style="flex:1.5; min-width:140px;">${itemOpts}</select>
                <input type="number" id="ln-npc-price-${n.id}" min="0" step="0.01" required placeholder="가격 (아데나)" style="flex:1; min-width:110px;" />
                <button type="submit" style="padding:6px 12px; font-size:12px;">+ 품목/가격 저장</button>
              </form>

              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
                <div style="background:#fff; padding:6px 8px; border-radius:6px; border:1px solid #dbeafe;">
                  <div style="font-size:12px; font-weight:700; color:#1d4ed8; margin-bottom:3px;">🛒 판매물품 및 가격</div>
                  ${renderSubList(sellItems, "#2563eb")}
                </div>
                <div style="background:#fff; padding:6px 8px; border-radius:6px; border:1px solid #dcfce7;">
                  <div style="font-size:12px; font-weight:700; color:#15803d; margin-bottom:3px;">💰 매입물품 및 가격</div>
                  ${renderSubList(buyItems, "#16a34a")}
                </div>
              </div>
            </div>
          `;
        }).join("")
      : `<p style="color:#94a3b8; font-size:12.5px; margin:4px 0;">등록된 NPC가 없습니다.</p>`;
  }
}

/* --- 서버 CRUD 핸들러 --- */
function startEditServer(id) {
  const item = lnBootstrap.servers.find(s => String(s.id) === String(id));
  if (!item) return;
  editingLnServerId = item.id;
  document.getElementById("ln-srv-name").value = item.server_name || "";
  document.getElementById("ln-srv-desc").value = item.description || "";
  document.getElementById("ln-srv-form-title").textContent = "✏️ 서버 수정 중";
  document.getElementById("ln-srv-submit-btn").textContent = "서버 수정 저장";
  document.getElementById("ln-srv-submit-btn").style.background = "#d97706";
  document.getElementById("ln-srv-cancel-btn").classList.remove("hidden");
}

function cancelEditServer() {
  editingLnServerId = null;
  document.getElementById("ln-srv-name").value = "";
  document.getElementById("ln-srv-desc").value = "";
  document.getElementById("ln-srv-form-title").textContent = "🌐 서버 등록 및 목록";
  document.getElementById("ln-srv-submit-btn").textContent = "서버 등록";
  document.getElementById("ln-srv-submit-btn").style.background = "";
  document.getElementById("ln-srv-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageServer(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    server_name: document.getElementById("ln-srv-name").value.trim(),
    description: document.getElementById("ln-srv-desc").value.trim(),
  };
  const url = editingLnServerId
    ? `/api/v1/modules/lineage_tracker/servers/${editingLnServerId}`
    : "/api/v1/modules/lineage_tracker/servers";
  const res = await fetch(url, {
    method: editingLnServerId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "서버 저장 실패", true);

  cancelEditServer();
  showMsg("서버 정보가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageServer(id) {
  if (!confirm("이 서버를 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/servers/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "서버 삭제 실패", true);
  if (editingLnServerId === id) cancelEditServer();
  showMsg("서버가 삭제되었습니다.");
  await reloadLineageBootstrap();
}

/* --- 혈맹 CRUD 핸들러 --- */
function startEditClan(id) {
  const item = lnBootstrap.clans.find(c => String(c.id) === String(id));
  if (!item) return;
  editingLnClanId = item.id;
  document.getElementById("ln-clan-name").value = item.clan_name || "";
  document.getElementById("ln-clan-desc").value = item.description || "";
  document.getElementById("ln-clan-form-title").textContent = "✏️ 혈맹 수정 중";
  document.getElementById("ln-clan-submit-btn").textContent = "혈맹 수정 저장";
  document.getElementById("ln-clan-submit-btn").style.background = "#d97706";
  document.getElementById("ln-clan-cancel-btn").classList.remove("hidden");
}

function cancelEditClan() {
  editingLnClanId = null;
  document.getElementById("ln-clan-name").value = "";
  document.getElementById("ln-clan-desc").value = "";
  document.getElementById("ln-clan-form-title").textContent = "🏰 혈맹 등록 및 목록 (선택 사항)";
  document.getElementById("ln-clan-submit-btn").textContent = "혈맹 등록";
  document.getElementById("ln-clan-submit-btn").style.background = "";
  document.getElementById("ln-clan-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageClan(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    clan_name: document.getElementById("ln-clan-name").value.trim(),
    description: document.getElementById("ln-clan-desc").value.trim(),
  };
  const url = editingLnClanId
    ? `/api/v1/modules/lineage_tracker/clans/${editingLnClanId}`
    : "/api/v1/modules/lineage_tracker/clans";
  const res = await fetch(url, {
    method: editingLnClanId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "혈맹 저장 실패", true);

  cancelEditClan();
  showMsg("혈맹 정보가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageClan(id) {
  if (!confirm("이 혈맹을 삭제하시겠습니까? (연결된 캐릭터의 혈맹 정보는 '혈맹없음'으로 전환됩니다)")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/clans/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "혈맹 삭제 실패", true);
  if (editingLnClanId === id) cancelEditClan();
  showMsg("혈맹이 삭제되었습니다.");
  await reloadLineageBootstrap();
}

/* --- 계정 CRUD 핸들러 --- */
function startEditAccount(id) {
  const item = lnBootstrap.accounts.find(a => String(a.id) === String(id));
  if (!item) return;
  editingLnAccountId = item.id;
  document.getElementById("ln-acc-name").value = item.account_name || "";
  document.getElementById("ln-acc-memo").value = item.memo || "";
  document.getElementById("ln-acc-form-title").textContent = "✏️ 게임 계정 수정 중";
  document.getElementById("ln-acc-submit-btn").textContent = "계정 수정 저장";
  document.getElementById("ln-acc-submit-btn").style.background = "#d97706";
  document.getElementById("ln-acc-cancel-btn").classList.remove("hidden");
}

function cancelEditAccount() {
  editingLnAccountId = null;
  document.getElementById("ln-acc-name").value = "";
  document.getElementById("ln-acc-memo").value = "";
  document.getElementById("ln-acc-form-title").textContent = "🔑 게임 계정 등록 및 목록";
  document.getElementById("ln-acc-submit-btn").textContent = "계정 등록";
  document.getElementById("ln-acc-submit-btn").style.background = "";
  document.getElementById("ln-acc-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageAccount(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    account_name: document.getElementById("ln-acc-name").value.trim(),
    memo: document.getElementById("ln-acc-memo").value.trim(),
  };
  const url = editingLnAccountId
    ? `/api/v1/modules/lineage_tracker/accounts/${editingLnAccountId}`
    : "/api/v1/modules/lineage_tracker/accounts";
  const res = await fetch(url, {
    method: editingLnAccountId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "계정 저장 실패", true);

  cancelEditAccount();
  showMsg("게임 계정 정보가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageAccount(id) {
  if (!confirm("이 게임 계정을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/accounts/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "계정 삭제 실패", true);
  if (editingLnAccountId === id) cancelEditAccount();
  showMsg("계정이 삭제되었습니다.");
  await reloadLineageBootstrap();
}

/* --- 캐릭터 CRUD 핸들러 --- */
function startEditCharacter(id) {
  const ch = lnBootstrap.characters.find(c => String(c.id) === String(id));
  if (!ch) return;
  editingLnCharacterId = ch.id;
  document.getElementById("ln-char-server").value = ch.server_id || "";
  document.getElementById("ln-char-account").value = ch.account_id || "";
  document.getElementById("ln-char-name").value = ch.character_name || "";
  document.getElementById("ln-char-clan").value = ch.clan_id || "";
  document.getElementById("ln-char-form-title").textContent = "✏️ 캐릭터 수정 중";
  document.getElementById("ln-char-submit-btn").textContent = "캐릭터 수정 저장";
  document.getElementById("ln-char-submit-btn").style.background = "#d97706";
  document.getElementById("ln-char-cancel-btn").classList.remove("hidden");
}

function cancelEditCharacter() {
  editingLnCharacterId = null;
  document.getElementById("ln-char-name").value = "";
  document.getElementById("ln-char-clan").value = "";
  document.getElementById("ln-char-form-title").textContent = "🧙 캐릭터 등록 및 목록";
  document.getElementById("ln-char-submit-btn").textContent = "캐릭터 등록";
  document.getElementById("ln-char-submit-btn").style.background = "";
  document.getElementById("ln-char-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageCharacter(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    server_id: document.getElementById("ln-char-server").value,
    account_id: document.getElementById("ln-char-account").value,
    character_name: document.getElementById("ln-char-name").value.trim(),
    clan_id: document.getElementById("ln-char-clan").value || null,
  };
  const url = editingLnCharacterId
    ? `/api/v1/modules/lineage_tracker/characters/${editingLnCharacterId}`
    : "/api/v1/modules/lineage_tracker/characters";
  const res = await fetch(url, {
    method: editingLnCharacterId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "캐릭터 저장 실패", true);

  cancelEditCharacter();
  showMsg("캐릭터 정보가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageCharacter(id) {
  if (!confirm("이 캐릭터를 삭제하시겠습니까? (연결된 플레이 기록도 함께 삭제됩니다)")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/characters/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "캐릭터 삭제 실패", true);
  if (editingLnCharacterId === id) cancelEditCharacter();
  showMsg("캐릭터가 삭제되었습니다.");
  await reloadLineageBootstrap();
}

/* --- 아이템 단가 CRUD 핸들러 --- */
function startEditItem(id) {
  const it = lnBootstrap.items.find(i => String(i.id) === String(id));
  if (!it) return;
  editingLnItemId = it.id;
  document.getElementById("ln-item-name").value = it.item_name || "";
  document.getElementById("ln-item-price").value = it.adena_unit_price ?? 0;
  document.getElementById("ln-item-cat").value = it.category || "기타";
  document.getElementById("ln-item-form-title").textContent = "✏️ 아이템 단가 수정 중";
  document.getElementById("ln-item-submit-btn").textContent = "단가 수정 저장";
  document.getElementById("ln-item-submit-btn").style.background = "#d97706";
  document.getElementById("ln-item-cancel-btn").classList.remove("hidden");
}

function cancelEditItem() {
  editingLnItemId = null;
  document.getElementById("ln-item-name").value = "";
  document.getElementById("ln-item-price").value = "";
  document.getElementById("ln-item-cat").value = "재화";
  document.getElementById("ln-item-form-title").textContent = "💎 아이템 기본 아데나 환산 단가 등록 및 목록";
  document.getElementById("ln-item-submit-btn").textContent = "단가 등록";
  document.getElementById("ln-item-submit-btn").style.background = "";
  document.getElementById("ln-item-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageItem(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    item_name: document.getElementById("ln-item-name").value.trim(),
    adena_unit_price: parseFloat(document.getElementById("ln-item-price").value),
    category: document.getElementById("ln-item-cat").value,
  };
  const url = editingLnItemId
    ? `/api/v1/modules/lineage_tracker/items/${editingLnItemId}`
    : "/api/v1/modules/lineage_tracker/items";
  const res = await fetch(url, {
    method: editingLnItemId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "아이템 단가 저장 실패", true);

  cancelEditItem();
  showMsg("아이템 아데나 단가가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageItem(id) {
  if (!confirm("이 아이템을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/items/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "아이템 삭제 실패", true);
  if (editingLnItemId === id) cancelEditItem();
  showMsg("아이템이 삭제되었습니다.");
  await reloadLineageBootstrap();
}

/* --- NPC CRUD 및 NPC 취급 품목 핸들러 --- */
function startEditNpc(id) {
  const npc = (lnBootstrap.npcs || []).find(n => String(n.id) === String(id));
  if (!npc) return;
  editingLnNpcId = npc.id;
  document.getElementById("ln-npc-town").value = npc.town_name || "";
  document.getElementById("ln-npc-name").value = npc.npc_name || "";
  document.getElementById("ln-npc-biz").value = npc.business_type || "";
  document.getElementById("ln-npc-memo").value = npc.memo || "";
  document.getElementById("ln-npc-form-title").textContent = "✏️ NPC 상점 정보 수정 중";
  document.getElementById("ln-npc-submit-btn").textContent = "NPC 수정 저장";
  document.getElementById("ln-npc-submit-btn").style.background = "#d97706";
  document.getElementById("ln-npc-cancel-btn").classList.remove("hidden");
}

function cancelEditNpc() {
  editingLnNpcId = null;
  document.getElementById("ln-npc-town").value = "";
  document.getElementById("ln-npc-name").value = "";
  document.getElementById("ln-npc-biz").value = "";
  document.getElementById("ln-npc-memo").value = "";
  document.getElementById("ln-npc-form-title").textContent = "🏪 NPC 상점 등록 및 취급 품목 (판매가 · 매입가) 관리";
  document.getElementById("ln-npc-submit-btn").textContent = "NPC 등록";
  document.getElementById("ln-npc-submit-btn").style.background = "";
  document.getElementById("ln-npc-cancel-btn").classList.add("hidden");
}

async function handleSaveLineageNpc(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    town_name: document.getElementById("ln-npc-town").value.trim(),
    npc_name: document.getElementById("ln-npc-name").value.trim(),
    business_type: document.getElementById("ln-npc-biz").value.trim(),
    memo: document.getElementById("ln-npc-memo").value.trim(),
  };
  const url = editingLnNpcId
    ? `/api/v1/modules/lineage_tracker/npcs/${editingLnNpcId}`
    : "/api/v1/modules/lineage_tracker/npcs";
  const res = await fetch(url, {
    method: editingLnNpcId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 저장 실패", true);

  cancelEditNpc();
  showMsg("NPC 정보가 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageNpc(id) {
  if (!confirm("이 NPC와 등록된 판매/매입 품목을 모두 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/npcs/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 삭제 실패", true);
  if (editingLnNpcId === id) cancelEditNpc();
  showMsg("NPC가 삭제되었습니다.");
  await reloadLineageBootstrap();
}

async function handleAddNpcItem(e, npcId) {
  e.preventDefault();
  clearMsg();
  const payload = {
    trade_direction: document.getElementById(`ln-npc-dir-${npcId}`).value,
    item_id: document.getElementById(`ln-npc-item-${npcId}`).value,
    price_adena: parseFloat(document.getElementById(`ln-npc-price-${npcId}`).value),
  };
  const res = await fetch(`/api/v1/modules/lineage_tracker/npcs/${npcId}/items`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 품목 등록 실패", true);

  showMsg("NPC 취급 품목 및 가격이 저장되었습니다.");
  await reloadLineageBootstrap();
}

async function deleteLineageNpcItem(npcItemId) {
  const res = await fetch(`/api/v1/modules/lineage_tracker/npc-items/${npcItemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("품목 삭제 실패", true);
  showMsg("NPC 품목이 삭제되었습니다.");
  await reloadLineageBootstrap();
}