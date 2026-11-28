var lnInData = {
  is_lineage_admin: false,
  items: [],
  npcs: [],
};
var lnInItemPage = 1;
var lnInNpcPage = 1;
var editingInItemId = null;
var editingInNpcId = null;

function fmtInNum(val) {
  return Number(val || 0).toLocaleString("ko-KR");
}

async function initLineageItemsNpcsModule() {
  clearMsg();
  editingInItemId = null;
  editingInNpcId = null;
  await reloadLineageItemsNpcsData();
  switchLineageInTab("items");
}

async function reloadLineageItemsNpcsData() {
  const res = await fetch("/api/v1/modules/lineage_tracker/bootstrap", {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showMsg(err.detail || "데이터를 불러오지 못했습니다.", true);
    return;
  }
  const data = await res.json();
  lnInData.is_lineage_admin = Boolean(data.is_lineage_admin);
  lnInData.items = data.items || [];
  lnInData.npcs = data.npcs || [];

  document.getElementById("ln-in-item-admin-box")?.classList.toggle("hidden", !lnInData.is_lineage_admin);
  document.getElementById("ln-in-npc-admin-box")?.classList.toggle("hidden", !lnInData.is_lineage_admin);

  renderInItemsPage(lnInItemPage);
  renderInNpcsPage(lnInNpcPage);
}

function switchLineageInTab(tabName) {
  clearMsg();
  ["items", "npcs"].forEach(t => {
    const btn = document.getElementById(`ln-in-tab-${t}`);
    const view = document.getElementById(`ln-in-view-${t}`);
    if (btn) btn.className = t === tabName ? "" : "secondary";
    if (view) view.classList.toggle("hidden", t !== tabName);
  });
  if (tabName === "items") renderInItemsPage(lnInItemPage);
  if (tabName === "npcs") renderInNpcsPage(lnInNpcPage);
}

/* =========================================================
   아이템별 NPC 최저 구매가 / 최고 매입가 계산 헬퍼
========================================================= */
function computeBestNpcPricesForItem(itemId) {
  let lowestSell = null; // NPC 판매가 중 최저가 (플레이어 구매 최저가)
  let highestBuy = null; // NPC 매입가 중 최고가 (플레이어 판매 최고가)

  (lnInData.npcs || []).forEach(npc => {
    (npc.lineage_npc_items || []).forEach(ni => {
      if (String(ni.item_id) !== String(itemId)) return;
      const price = Number(ni.price_adena || 0);
      const entry = {
        price,
        npc_name: npc.npc_name,
        town_name: npc.town_name,
        business_type: npc.business_type,
      };
      if (ni.trade_direction === "SELL_TO_PLAYER") {
        if (!lowestSell || price < lowestSell.price) {
          lowestSell = entry;
        }
      } else if (ni.trade_direction === "BUY_FROM_PLAYER") {
        if (!highestBuy || price > highestBuy.price) {
          highestBuy = entry;
        }
      }
    });
  });

  return { lowestSell, highestBuy };
}

/* =========================================================
   1. 아이템 리스트 렌더링 (검색 + 페이지네이션 + 최저가/최고가 표시)
========================================================= */
function renderInItemsPage(page = 1) {
  lnInItemPage = page;
  const kw = (document.getElementById("ln-in-item-search")?.value || "").trim().toLowerCase();
  const cat = document.getElementById("ln-in-item-cat-filter")?.value || "ALL";
  const pageSize = parseInt(document.getElementById("ln-in-item-pagesize")?.value || "10", 10);

  const enriched = lnInData.items.map(it => ({
    ...it,
    best: computeBestNpcPricesForItem(it.id),
  }));

  const filtered = enriched.filter(it => {
    const matchCat = cat === "ALL" || (it.category || "기타") === cat;
    const matchKw =
      !kw ||
      (it.item_name || "").toLowerCase().includes(kw) ||
      (it.category || "").toLowerCase().includes(kw) ||
      (it.best.lowestSell?.npc_name || "").toLowerCase().includes(kw) ||
      (it.best.lowestSell?.town_name || "").toLowerCase().includes(kw) ||
      (it.best.highestBuy?.npc_name || "").toLowerCase().includes(kw) ||
      (it.best.highestBuy?.town_name || "").toLowerCase().includes(kw);
    return matchCat && matchKw;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnInItemPage > totalPages) lnInItemPage = totalPages;

  const start = (lnInItemPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-in-item-summary");
  if (sumEl) {
    sumEl.innerHTML = `전체 <b>${total}</b>개 아이템 (${lnInItemPage} / ${totalPages} 페이지)`;
  }

  const listEl = document.getElementById("ln-in-items-list");
  if (!listEl) return;

  if (!paged.length) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">조건에 맞는 아이템이 없습니다.</p>`;
    document.getElementById("ln-in-items-pagination").innerHTML = "";
    return;
  }

  const isAdmin = lnInData.is_lineage_admin;

  listEl.innerHTML = paged.map(it => {
    const { lowestSell, highestBuy } = it.best;

    const lowestHtml = lowestSell
      ? `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:7px 10px;">
           <div style="font-size:11.5px; color:#1e40af; font-weight:700;">🛒 NPC 판매 최저가 (유저 구매처)</div>
           <div style="font-size:14.5px; font-weight:800; color:#2563eb; margin-top:2px;">${fmtInNum(lowestSell.price)} 아데나</div>
           <div style="font-size:12px; color:#475569; margin-top:2px;">🏘️ ${lowestSell.town_name} · <b>${lowestSell.npc_name}</b> (${lowestSell.business_type})</div>
         </div>`
      : `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:7px 10px; color:#94a3b8; font-size:12px;">
           🛒 등록된 NPC 판매처(구매가) 없음
         </div>`;

    const highestHtml = highestBuy
      ? `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:7px 10px;">
           <div style="font-size:11.5px; color:#166534; font-weight:700;">💰 NPC 매입 최고가 (유저 판매처)</div>
           <div style="font-size:14.5px; font-weight:800; color:#16a34a; margin-top:2px;">${fmtInNum(highestBuy.price)} 아데나</div>
           <div style="font-size:12px; color:#475569; margin-top:2px;">🏘️ ${highestBuy.town_name} · <b>${highestBuy.npc_name}</b> (${highestBuy.business_type})</div>
         </div>`
      : `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px; padding:7px 10px; color:#94a3b8; font-size:12px;">
           💰 등록된 NPC 매입처(판매가) 없음
         </div>`;

    return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <span class="tag">${it.category || "기타"}</span>
            <strong style="font-size:16px; color:#0f172a; margin-left:6px;">${it.item_name}</strong>
            <span style="font-size:12.5px; color:#64748b; margin-left:8px;">
              (기본 환산단가: <b>${fmtInNum(it.adena_unit_price)} 아데나</b>)
            </span>
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:6px;">
              <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startInEditItem('${it.id}')">수정</button>
              ${it.item_name !== "아데나" ? `<button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteInItem('${it.id}')">삭제</button>` : ""}
            </div>
          ` : ""}
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:10px;">
          ${lowestHtml}
          ${highestHtml}
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("ln-in-items-pagination").innerHTML =
    renderPaginationBar(lnInItemPage, totalPages, "renderInItemsPage");
}

function startInEditItem(id) {
  const it = lnInData.items.find(i => String(i.id) === String(id));
  if (!it) return;
  editingInItemId = it.id;
  document.getElementById("ln-in-item-name").value = it.item_name || "";
  document.getElementById("ln-in-item-price").value = it.adena_unit_price ?? 0;
  document.getElementById("ln-in-item-cat").value = it.category || "기타";
  document.getElementById("ln-in-item-form-title").textContent = "✏️ 아이템 정보 수정 중";
  document.getElementById("ln-in-item-submit-btn").textContent = "수정 저장";
  document.getElementById("ln-in-item-submit-btn").style.background = "#d97706";
  document.getElementById("ln-in-item-cancel-btn").classList.remove("hidden");
  document.getElementById("ln-in-item-admin-box")?.scrollIntoView({ behavior: "smooth" });
}

function cancelInEditItem() {
  editingInItemId = null;
  document.getElementById("ln-in-item-name").value = "";
  document.getElementById("ln-in-item-price").value = "";
  document.getElementById("ln-in-item-cat").value = "재화";
  document.getElementById("ln-in-item-form-title").textContent = "➕ 새 아이템 등록 (기본 환산 단가)";
  document.getElementById("ln-in-item-submit-btn").textContent = "아이템 저장";
  document.getElementById("ln-in-item-submit-btn").style.background = "";
  document.getElementById("ln-in-item-cancel-btn").classList.add("hidden");
}

async function handleInSaveItem(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    item_name: document.getElementById("ln-in-item-name").value.trim(),
    adena_unit_price: parseFloat(document.getElementById("ln-in-item-price").value),
    category: document.getElementById("ln-in-item-cat").value,
  };
  const url = editingInItemId
    ? `/api/v1/modules/lineage_tracker/items/${editingInItemId}`
    : "/api/v1/modules/lineage_tracker/items";
  const res = await fetch(url, {
    method: editingInItemId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "아이템 저장 실패", true);

  cancelInEditItem();
  showMsg("아이템 정보가 저장되었습니다.");
  await reloadLineageItemsNpcsData();
}

async function deleteInItem(id) {
  if (!confirm("이 아이템을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/items/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "아이템 삭제 실패", true);
  if (editingInItemId === id) cancelInEditItem();
  showMsg("아이템이 삭제되었습니다.");
  await reloadLineageItemsNpcsData();
}

/* =========================================================
   2. NPC 상점 리스트 렌더링 (검색 + 페이지네이션 + 취급 품목 관리)
========================================================= */
function renderInNpcsPage(page = 1) {
  lnInNpcPage = page;
  const kw = (document.getElementById("ln-in-npc-search")?.value || "").trim().toLowerCase();
  const pageSize = parseInt(document.getElementById("ln-in-npc-pagesize")?.value || "10", 10);

  const filtered = (lnInData.npcs || []).filter(n => {
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

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (lnInNpcPage > totalPages) lnInNpcPage = totalPages;

  const start = (lnInNpcPage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  const sumEl = document.getElementById("ln-in-npc-summary");
  if (sumEl) {
    sumEl.innerHTML = `전체 <b>${total}</b>개 NPC (${lnInNpcPage} / ${totalPages} 페이지)`;
  }

  const listEl = document.getElementById("ln-in-npcs-list");
  if (!listEl) return;

  if (!paged.length) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">조건에 맞는 NPC가 없습니다.</p>`;
    document.getElementById("ln-in-npcs-pagination").innerHTML = "";
    return;
  }

  const isAdmin = lnInData.is_lineage_admin;
  const itemOpts = lnInData.items
    .filter(i => i.item_name !== "아데나")
    .map(i => `<option value="${i.id}">${i.item_name}</option>`)
    .join("");

  listEl.innerHTML = paged.map(n => {
    const allItems = n.lineage_npc_items || [];
    const sellItems = allItems.filter(i => i.trade_direction === "SELL_TO_PLAYER");
    const buyItems = allItems.filter(i => i.trade_direction === "BUY_FROM_PLAYER");

    const renderSubList = (arr, color) => arr.length
      ? arr.map(ni => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px dashed #e2e8f0; font-size:12.5px;">
            <span>${ni.lineage_items?.item_name || "-"}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              <b style="color:${color};">${fmtInNum(ni.price_adena)} 아데나</b>
              ${isAdmin ? `<button type="button" class="danger" style="padding:1px 6px; font-size:11px;" onclick="deleteInNpcItem('${ni.id}')">✕</button>` : ""}
            </div>
          </div>
        `).join("")
      : `<span style="color:#94a3b8; font-size:12px;">등록된 품목 없음</span>`;

    return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
          <div>
            <span class="pos-badge">🏘️ ${n.town_name}</span>
            <span class="tag" style="margin-left:4px;">${n.business_type}</span>
            <strong style="font-size:15.5px; margin-left:6px; color:#0f172a;">${n.npc_name}</strong>
            ${n.memo ? `<small style="color:#64748b; margin-left:8px;">(${n.memo})</small>` : ""}
          </div>
          ${isAdmin ? `
            <div style="display:flex; gap:4px;">
              <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startInEditNpc('${n.id}')">정보 수정</button>
              <button type="button" class="danger" style="padding:4px 9px; font-size:12px;" onclick="deleteInNpc('${n.id}')">NPC 삭제</button>
            </div>
          ` : ""}
        </div>

        ${isAdmin ? `
          <form onsubmit="handleInAddNpcItem(event, '${n.id}')" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; background:#f8fafc; padding:7px 9px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:8px;">
            <select id="ln-in-npc-dir-${n.id}" style="flex:1.2; min-width:150px;">
              <option value="SELL_TO_PLAYER">🛒 NPC 판매물품 (유저가 구매)</option>
              <option value="BUY_FROM_PLAYER">💰 NPC 매입물품 (유저가 판매)</option>
            </select>
            <select id="ln-in-npc-item-${n.id}" style="flex:1.5; min-width:140px;">${itemOpts}</select>
            <input type="number" id="ln-in-npc-price-${n.id}" min="0" step="0.01" required placeholder="가격 (아데나)" style="flex:1; min-width:110px;" />
            <button type="submit" style="padding:6px 12px; font-size:12px;">+ 품목/가격 저장</button>
          </form>
        ` : ""}

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
          <div style="background:#eff6ff; padding:8px 10px; border-radius:6px;">
            <div style="font-weight:700; font-size:12.5px; color:#1d4ed8; margin-bottom:4px;">🛒 NPC 판매물품 및 가격 (구매가)</div>
            ${renderSubList(sellItems, "#2563eb")}
          </div>
          <div style="background:#f0fdf4; padding:8px 10px; border-radius:6px;">
            <div style="font-weight:700; font-size:12.5px; color:#15803d; margin-bottom:4px;">💰 NPC 매입물품 및 가격 (판매가)</div>
            ${renderSubList(buyItems, "#16a34a")}
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.getElementById("ln-in-npcs-pagination").innerHTML =
    renderPaginationBar(lnInNpcPage, totalPages, "renderInNpcsPage");
}

function startInEditNpc(id) {
  const npc = (lnInData.npcs || []).find(n => String(n.id) === String(id));
  if (!npc) return;
  editingInNpcId = npc.id;
  document.getElementById("ln-in-npc-town").value = npc.town_name || "";
  document.getElementById("ln-in-npc-name").value = npc.npc_name || "";
  document.getElementById("ln-in-npc-biz").value = npc.business_type || "";
  document.getElementById("ln-in-npc-memo").value = npc.memo || "";
  document.getElementById("ln-in-npc-form-title").textContent = "✏️ NPC 정보 수정 중";
  document.getElementById("ln-in-npc-submit-btn").textContent = "NPC 수정 저장";
  document.getElementById("ln-in-npc-submit-btn").style.background = "#d97706";
  document.getElementById("ln-in-npc-cancel-btn").classList.remove("hidden");
  document.getElementById("ln-in-npc-admin-box")?.scrollIntoView({ behavior: "smooth" });
}

function cancelInEditNpc() {
  editingInNpcId = null;
  document.getElementById("ln-in-npc-town").value = "";
  document.getElementById("ln-in-npc-name").value = "";
  document.getElementById("ln-in-npc-biz").value = "";
  document.getElementById("ln-in-npc-memo").value = "";
  document.getElementById("ln-in-npc-form-title").textContent = "🏪 새 NPC 상점 등록";
  document.getElementById("ln-in-npc-submit-btn").textContent = "NPC 저장";
  document.getElementById("ln-in-npc-submit-btn").style.background = "";
  document.getElementById("ln-in-npc-cancel-btn").classList.add("hidden");
}

async function handleInSaveNpc(e) {
  e.preventDefault();
  clearMsg();
  const payload = {
    town_name: document.getElementById("ln-in-npc-town").value.trim(),
    npc_name: document.getElementById("ln-in-npc-name").value.trim(),
    business_type: document.getElementById("ln-in-npc-biz").value.trim(),
    memo: document.getElementById("ln-in-npc-memo").value.trim(),
  };
  const url = editingInNpcId
    ? `/api/v1/modules/lineage_tracker/npcs/${editingInNpcId}`
    : "/api/v1/modules/lineage_tracker/npcs";
  const res = await fetch(url, {
    method: editingInNpcId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 저장 실패", true);

  cancelInEditNpc();
  showMsg("NPC 정보가 저장되었습니다.");
  await reloadLineageItemsNpcsData();
}

async function deleteInNpc(id) {
  if (!confirm("이 NPC와 등록된 판매/매입 품목을 모두 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/lineage_tracker/npcs/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 삭제 실패", true);
  if (editingInNpcId === id) cancelInEditNpc();
  showMsg("NPC가 삭제되었습니다.");
  await reloadLineageItemsNpcsData();
}

async function handleInAddNpcItem(e, npcId) {
  e.preventDefault();
  clearMsg();
  const payload = {
    trade_direction: document.getElementById(`ln-in-npc-dir-${npcId}`).value,
    item_id: document.getElementById(`ln-in-npc-item-${npcId}`).value,
    price_adena: parseFloat(document.getElementById(`ln-in-npc-price-${npcId}`).value),
  };
  const res = await fetch(`/api/v1/modules/lineage_tracker/npcs/${npcId}/items`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "NPC 품목 등록 실패", true);

  showMsg("NPC 취급 품목 및 가격이 저장되었습니다.");
  await reloadLineageItemsNpcsData();
}

async function deleteInNpcItem(npcItemId) {
  const res = await fetch(`/api/v1/modules/lineage_tracker/npc-items/${npcItemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("품목 삭제 실패", true);
  showMsg("NPC 품목이 삭제되었습니다.");
  await reloadLineageItemsNpcsData();
}