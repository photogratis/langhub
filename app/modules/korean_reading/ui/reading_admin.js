async function handleCreateReadingPassage(e) {
  e.preventDefault();
  const title = document.getElementById("kr-new-title").value.trim();
  const level = document.getElementById("kr-new-level").value;
  const tags = document.getElementById("kr-new-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const content = document.getElementById("kr-new-content").value.trim();

  const res = await fetch("/api/v1/modules/korean_reading/passages", {
    method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ title, level, tags, content })
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "지문 등록 실패", true);

  playKoreanTtsText(content, 1.0);
  e.target.reset();
  showMsg("새 읽기 지문이 등록되었습니다.");
  loadAdminReadingPassages();
}

async function loadAdminReadingPassages() {
  const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
  const container = document.getElementById("kr-admin-passage-list");
  if (!res.ok) return;

  kreadingPassagesCache = await res.json();
  container.innerHTML = kreadingPassagesCache.map(p => `
    <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div><span class="pos-badge">${p.level}</span> <strong style="margin-left:6px;">${p.title}</strong> (${p.char_count}음절)</div><div style="display:flex; gap:6px;">
        <button type="button" style="background:#0284c7; padding:6px 10px; font-size:12px;" onclick="playPassageTtsById('${p.id}', 1.0)">🔊 듣기</button>
        <button type="button" style="background:#dc2626; padding:6px 10px; font-size:12px;" onclick="deleteReadingPassage('${p.id}')">삭제</button>
      </div>
    </div>
  `).join("");
}

async function deleteReadingPassage(passageId) {
  if (!confirm("이 지문을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, { method: "DELETE", headers: getAuthHeaders(false) });
  if (!res.ok) return showMsg("삭제 실패", true);
  loadAdminReadingPassages();
}