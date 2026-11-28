var lnBootstrap = { is_lineage_admin: false, clans: [], characters: [], items: [] };
var lnActiveSession = null;
var lnAllInventories = [];

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
  const res = await fetch("/api/v1/modules/lineage_tracker/bootstrap", {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return showMsg(err.detail || "LINEAGE 등급 접근 권한이 필요합니다.", true);
  }
  lnBootstrap = await res.json();

  document.querySelectorAll(".ln-admin-only").forEach(el => {
    el.classList.toggle("hidden", !lnBootstrap.is_lineage_admin);
  });

  populateLineageSelectors();

  // 기본 정산 조회 기간 (이번 달 1일 ~ 오늘)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const startEl = document.getElementById("ln-pay-start");
  const endEl = document.getElementById("ln-pay-end");
  if (startEl && !startEl.value) startEl.value = firstDay.toISOString().slice(0, 10);
  if (endEl && !endEl.value) endEl.value = today.toISOString().slice(0, 10);

  switchLineageTab("play");
}

function populateLineageSelectors() {
  const clanOpts = lnBootstrap.clans
    .map(c => `<option value="${c.id}">[${c.server_name}] ${c.clan_name}</option>`)
    .join("");

  const charOpts = lnBootstrap.characters
    .map(ch => {
      const srv = ch.lineage_clans ? `[${ch.lineage_clans.server_name}/${ch.lineage_clans.clan_name}] ` : "";
      return `<option value="${ch.id}">${srv}${ch.account_name} - ${ch.character_name} (Lv.${ch.current_level})</option>`;
    })
    .join("");

  const itemOpts = lnBootstrap.items
    .map(it => `<option value="${it.id}">${it.item_name} (${fmtNum(it.adena_unit_price)} 아데나)</option>`)
    .join("");

  ["ln-tx-clan", "ln-adj-clan", "ln-char-clan"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = clanOpts;
  });

  ["ln-start-char", "ln-tx-char", "ln-adj-char"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = charOpts;
  });

  ["ln-tx-item", "ln-adj-item"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = itemOpts;
  });
}

function switchLineageTab(tabName) {
  clearMsg();
  ["play", "storage", "history", "admin"].forEach(t => {
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
    loadAllInventoriesView();
    loadLineageTransactionsAndLogs();
  } else if (tabName === "history") {
    loadPlaySessionsHistory();
    loadMyIdrPayouts();
  } else if (tabName === "admin") {
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
    document.getElementById("ln-active-char-badge").textContent =
      `${ch.account_name || ""} - ${ch.character_name || ""}`;
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
   탭 2: 개인/혈맹 창고 입출고 & 판매/이전
========================================================= */
function toggleTxSaleField() {
  const t = document.getElementById("ln-tx-type")?.value;
  document.getElementById("ln-tx-sale-box")?.classList.toggle("hidden", t !== "SELL");
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

  e.target.reset();
  toggleTxSaleField();
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

  const renderBox = (elId, list) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<span style="color:#94a3b8;">보유 아이템 없음</span>`;
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
  renderBox("ln-inv-clan", lnAllInventories.filter(i => i.storage_type === "CLAN"));
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
   탭 3: 플레이 내역 & 내 IDR 급여 지급 기록
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
            <span style="color:#475569; margin-left:4px;">(${ch.account_name || ""} - ${ch.character_name || ""})</span>
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
   탭 4: LINEAGE_ADMIN 전용 (보정 / IDR 정산 / 마스터 등록)
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

  e.target.reset();
  toggleAdjustTargetFields();
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

async function handleUpsertLineageItem(e) {
  e.preventDefault();
  const payload = {
    item_name: document.getElementById("ln-item-name").value.trim(),
    adena_unit_price: parseFloat(document.getElementById("ln-item-price").value),
    category: document.getElementById("ln-item-cat").value,
  };
  const res = await fetch("/api/v1/modules/lineage_tracker/items", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return showMsg("아이템 단가 저장 실패", true);
  e.target.reset();
  showMsg("아이템 아데나 단가가 저장되었습니다.");
  initLineageTrackerModule();
}

async function handleCreateLineageCharacter(e) {
  e.preventDefault();
  const payload = {
    clan_id: document.getElementById("ln-char-clan").value || null,
    account_name: document.getElementById("ln-char-account").value.trim(),
    character_name: document.getElementById("ln-char-name").value.trim(),
    current_level: parseInt(document.getElementById("ln-char-level").value, 10),
    current_exp: parseFloat(document.getElementById("ln-char-exp").value),
  };
  const res = await fetch("/api/v1/modules/lineage_tracker/characters", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return showMsg("캐릭터 등록 실패", true);
  e.target.reset();
  showMsg("새 계정/캐릭터가 등록되었습니다.");
  initLineageTrackerModule();
}

async function handleCreateLineageClan(e) {
  e.preventDefault();
  const payload = {
    server_name: document.getElementById("ln-clan-server").value.trim(),
    clan_name: document.getElementById("ln-clan-name").value.trim(),
    description: document.getElementById("ln-clan-desc").value.trim(),
  };
  const res = await fetch("/api/v1/modules/lineage_tracker/clans", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return showMsg("서버/혈맹 추가 실패", true);
  e.target.reset();
  showMsg("새 서버/혈맹이 추가되었습니다.");
  initLineageTrackerModule();
}