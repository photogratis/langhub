async function populatePublicPassageSelector() {
  if (!kreadingPassagesCache.length) {
    const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
    if (res.ok) kreadingPassagesCache = await res.json();
  }
  const sel = document.getElementById("kr-public-passage-select");
  if (!kreadingPassagesCache.length) {
    sel.innerHTML = `<option value="">등록된 지문이 없습니다</option>`;
    return;
  }
  sel.innerHTML = kreadingPassagesCache.map(p => `<option value="${p.id}">[${p.level}] ${p.title}</option>`).join("");
  if (selectedReadingPassage) sel.value = selectedReadingPassage.id;
  loadPublicAttemptsForSelectedPassage();
}

async function loadPublicAttemptsForSelectedPassage() {
  const passageId = document.getElementById("kr-public-passage-select")?.value;
  const sortBy = document.getElementById("kr-public-sort")?.value || "accuracy";
  const container = document.getElementById("kr-public-attempts-list");
  if (!passageId) return;

  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}/public-attempts?sort_by=${sortBy}`, { headers: getAuthHeaders(false) });
  if (!res.ok) return (container.innerHTML = `<p style="color:#b91c1c;">불러오기 실패</p>`);

  const items = await res.json();
  container.innerHTML = items.length ? items.map((item, idx) => `
    <div class="word-card" style="background:#fff; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <strong>#${idx + 1} ${item.user_nickname}</strong>
        <span>정확도 <b>${item.accuracy_score}%</b> · <b>${item.cpm} CPM</b> (${item.duration_seconds}초)</span>
      </div>
      <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
    </div>
  `).join("") : `<p style="color:#64748b; text-align:center; padding:20px;">아직 공개된 기록이 없습니다.</p>`;
}

async function loadMyReadingAttempts() {
  const container = document.getElementById("kr-my-attempts-list");
  if (!currentUser) return (container.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px;">로그인 후 이용 가능합니다.</p>`);

  const res = await fetch("/api/v1/modules/korean_reading/my-attempts", { headers: getAuthHeaders(false) });
  if (!res.ok) return (container.innerHTML = `<p style="color:#b91c1c;">내 기록 로드 실패</p>`);

  const items = await res.json();
  container.innerHTML = items.length ? items.map(item => `
    <div class="word-card" style="background:#fff; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong>${item.reading_passages?.title || "지문"} (${item.accuracy_score}% · ${item.cpm} CPM)</strong>
        <button type="button" class="${item.is_public ? "" : "secondary"}" style="padding:4px 10px; font-size:12px;" onclick="toggleMyReadingVisibility('${item.id}', ${!item.is_public})">
          ${item.is_public ? "🌐 공개 중" : "🔒 비공개"}
        </button>
      </div>
      <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
    </div>
  `).join("") : `<p style="color:#64748b; text-align:center; padding:20px;">기록이 없습니다.</p>`;
}

async function toggleMyReadingVisibility(attemptId, nextPublic) {
  const res = await fetch(`/api/v1/modules/korean_reading/attempts/${attemptId}/visibility`, {
    method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify({ is_public: nextPublic })
  });
  if (!res.ok) return showMsg("공개 설정 변경 실패", true);
  loadMyReadingAttempts();
}