var editingReadingPassageId = null;

function startEditReadingPassage(passageId) {
  const p = (kreadingPassagesCache || []).find(item => item.id === passageId);
  if (!p) return;

  editingReadingPassageId = passageId;
  document.getElementById("kr-new-title").value = p.title || "";
  document.getElementById("kr-new-level").value = p.level || "초급";
  document.getElementById("kr-new-tags").value = (p.tags || []).join(", ");
  document.getElementById("kr-new-content").value = p.content || "";

  const submitBtn = document.getElementById("kr-passage-submit-btn");
  const cancelBtn = document.getElementById("kr-passage-cancel-edit-btn");
  if (submitBtn) submitBtn.textContent = "수정 내용 저장";
  if (cancelBtn) cancelBtn.classList.remove("hidden");
  document.getElementById("kr-new-title").focus();
}

function cancelEditReadingPassage() {
  editingReadingPassageId = null;
  document.getElementById("kr-passage-form")?.reset();
  const submitBtn = document.getElementById("kr-passage-submit-btn");
  const cancelBtn = document.getElementById("kr-passage-cancel-edit-btn");
  if (submitBtn) submitBtn.textContent = "지문 등록하기";
  if (cancelBtn) cancelBtn.classList.add("hidden");
}

async function handleCreateReadingPassage(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById("kr-new-title").value.trim(),
    level: document.getElementById("kr-new-level").value,
    tags: document.getElementById("kr-new-tags").value.split(",").map(t => t.trim()).filter(Boolean),
    content: document.getElementById("kr-new-content").value.trim()
  };

  const isEdit = Boolean(editingReadingPassageId);
  const url = isEdit
    ? `/api/v1/modules/korean_reading/passages/${editingReadingPassageId}`
    : "/api/v1/modules/korean_reading/passages";

  const res = await fetch(url, {
    method: isEdit ? "PUT" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "저장 실패", true);

  cancelEditReadingPassage();
  showMsg(isEdit ? "지문이 수정되었습니다." : "새 읽기 지문이 등록되었습니다.");
  if (!isEdit && typeof playKoreanTtsText === "function") playKoreanTtsText(payload.content, 1.0);
  loadAdminReadingPassages();
}

async function loadAdminReadingPassages() {
  const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
  if (!res.ok) return;
  kreadingPassagesCache = await res.json();
  renderAdminPassagesPaged(krAdminPage);
}

async function deleteReadingPassage(passageId) {
  if (!confirm("이 지문을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, { method: "DELETE", headers: getAuthHeaders(false) });
  if (!res.ok) return showMsg("삭제 실패", true);
  if (editingReadingPassageId === passageId) cancelEditReadingPassage();
  loadAdminReadingPassages();
}