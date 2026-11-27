/* =========================================================
   korean_reading/ui/widget.js
   - 그룹 선택 시 해당 그룹 내 읽기 자료만 표기 + 페이지네이션 (테스트 & 관리 탭)
   - 같은 그룹 내 이전/다음 지문 연속 학습 이동
   - 모듈 내부 서브메뉴·라벨·리포트 한국어(ko) / 인도네시아어(id) 다국어 지원
========================================================= */

var kreadingGroupsCache = [];
var kreadingPassagesCache = [];
var kreadingAdminPassagesCache = [];
var selectedReadingPassage = null;

var krTestPage = 1;
var krAdminPage = 1;
var krActiveTab = "test";

var krMediaStream = null;
var krMediaRecorder = null;
var krRecordedChunks = [];
var krAudioContext = null;
var krAnalyser = null;
var krVadAnimId = null;

var krSpeechRecognition = null;
var krFinalTranscript = "";
var krInterimTranscript = "";

var krIsRecording = false;
var krSpeechStarted = false;
var krActualStartMs = 0;
var krLastSpeechMs = 0;
var krSilenceAutoStopTimer = null;

/* =========================================================
   다국어 사전 (한국어 / 인도네시아어)
========================================================= */
const KR_I18N = {
  ko: {
    tab_test: "📖 읽기 테스트",
    tab_public: "🎧 공개 녹음 듣기",
    tab_my: "🗂️ 내 녹음 관리",
    tab_admin: "⚙️ 지문·그룹 관리",
    all_groups: "전체 그룹 (모든 읽기 자료)",
    ungrouped: "📌 단독 지문만 보기 (그룹 없음)",
    all_levels: "전체 난이도",
    level_beginner: "초급",
    level_intermediate: "중급",
    level_advanced: "고급",
    ph_tag: "태그 검색...",
    ph_search_title: "지문 제목 검색...",
    btn_reset_group: "✕ 전체 보기",
    page_unit_5: "5개씩",
    page_unit_10: "10개씩",
    page_unit_20: "20개씩",
    page_unit_50: "50개씩",
    summary_fmt: (total, p, tp) => `전체 <b>${total}</b>개 지문 (${p} / ${tp} 페이지)`,
    empty_passages: "조건에 맞는 읽기 지문이 없습니다.",
    btn_read_this: "이 지문 읽기",
    order_badge_fmt: n => `${n}번`,
    meta_fmt: (c, w, a) => `분량: <b>${c}음절 (${w}어절)</b> · 출제자: ${a}`,
    active_meta_fmt: (c, w, a) => `총 <b>${c}음절</b> · <b>${w}어절</b> · 작성자: ${a}`,
    tts_label: "🔊 지문 미리 듣기 (TTS)",
    tts_normal: "▶️ 보통 속도 (1.0x)",
    tts_slow: "🐢 천천히 듣기 (0.8x)",
    tts_stop: "⏹️ 정지",
    lbl_vad_state: "측정 상태",
    vad_ready: "대기 중 — 아래 [녹음 시작]을 누른 뒤 읽기 시작하세요",
    vad_listening: "🎤 준비 완료! 첫 단어를 소리 내어 읽으면 카운트가 자동 시작됩니다...",
    vad_speaking: "🔴 발화 감지됨 — 속도 및 정확도 측정 중!",
    vad_cancelled: "녹음이 취소되었습니다.",
    vad_analyzing: "⏳ 녹음 파일 저장 및 발음 정확도 분석 중...",
    vad_done: "✅ 측정 완료!",
    vad_fail: "제출 실패",
    lbl_speech_time: "실제 발화 시간",
    sec_unit: "초",
    recognized_prefix: "인식된 발화",
    lbl_public_check: "내 기록을 공개하여 다른 학습자도 듣고 참고할 수 있게 하기",
    btn_start: "🎙️ 녹음 시작",
    btn_stop: "⏹️ 읽기 완료 · 채점하기",
    btn_cancel: "취소",
    btn_prev_in_group: "⬅️ 이전 지문",
    btn_next_in_group: "다음 지문 ➡️",
    report_title: "📊 읽기 평가 리포트",
    badge_public: "공개 기록 등록됨",
    badge_private: "비공개 기록",
    stat_acc: "발음·내용 정확도",
    stat_speed: "읽기 속도 (분당 음절)",
    stat_time: "순수 발화 시간",
    diff_guide: "어절별 정확도 분석 (초록: 정확 / 빨강: 누락·오독 의심)",
    recognized_text_lbl: "인식된 텍스트",
    btn_retry: "🔄 다시 도전하기",
    lbl_pub_passage: "지문 선택",
    lbl_pub_sort: "정렬 기준",
    opt_all_public: "🌐 전체 지문 공개 기록 모두 보기",
    sort_recent: "최신 등록순",
    sort_accuracy: "정확도 높은순",
    sort_speed: "읽기 속도순 (CPM)",
    empty_public: "아직 공개된 읽기 기록이 없습니다. 첫 번째 공개 기록의 주인공이 되어 보세요!",
    acc_lbl: "정확도",
    speed_lbl: "속도",
    my_login_req: "로그인하시면 내 읽기 측정 기록과 공개 설정·삭제 관리가 가능합니다.",
    empty_my: "아직 응시한 읽기 기록이 없습니다.",
    btn_make_private: "🌐 공개 중 (비공개 전환)",
    btn_make_public: "🔒 비공개 (공개하기)",
    btn_delete: "🗑️ 삭제",
    btn_edit: "✏️ 수정",
    grp_sec_title: "📁 지문 그룹 관리",
    btn_toggle_grp: "+ 그룹 추가 / 목록 보기",
    lbl_grp_name: "그룹 제목 (한국어)",
    lbl_grp_name_id: "그룹 제목 (인도네시아어, 선택)",
    lbl_grp_desc: "그룹 설명 (선택)",
    btn_grp_save: "그룹 저장",
    edit_box_title: "✏️ 읽기 지문 수정",
    btn_close: "닫기",
    new_box_title: "새 읽기 지문 등록",
    lbl_group: "소속 그룹",
    lbl_order: "그룹 내 순서",
    opt_no_group: "그룹 없음 (단독 지문)",
    lbl_title: "제목",
    lbl_level: "난이도",
    lbl_tags: "태그 (쉼표 구분)",
    lbl_content: "읽기 본문",
    btn_save_edit: "수정 내용 저장",
    btn_create_passage: "지문 등록하기",
    all_groups_admin: "전체 그룹 지문 보기",
    ph_admin_search: "등록된 지문 제목 검색...",
  },
  id: {
    tab_test: "📖 Tes Membaca",
    tab_public: "🎧 Rekaman Publik",
    tab_my: "🗂️ Rekaman Saya",
    tab_admin: "⚙️ Kelola Materi & Grup",
    all_groups: "Semua Grup (Semua Materi)",
    ungrouped: "📌 Materi Tunggal Saja (Tanpa Grup)",
    all_levels: "Semua Tingkat",
    level_beginner: "Pemula",
    level_intermediate: "Menengah",
    level_advanced: "Mahir",
    ph_tag: "Cari tag...",
    ph_search_title: "Cari judul bacaan...",
    btn_reset_group: "✕ Lihat Semua",
    page_unit_5: "5 / hal",
    page_unit_10: "10 / hal",
    page_unit_20: "20 / hal",
    page_unit_50: "50 / hal",
    summary_fmt: (total, p, tp) => `Total <b>${total}</b> materi (Hal. ${p} / ${tp})`,
    empty_passages: "Tidak ada materi bacaan yang sesuai.",
    btn_read_this: "Baca Materi Ini",
    order_badge_fmt: n => `No. ${n}`,
    meta_fmt: (c, w, a) => `Panjang: <b>${c} suku kata (${w} kata)</b> · Penulis: ${a}`,
    active_meta_fmt: (c, w, a) => `Total <b>${c} suku kata</b> · <b>${w} kata</b> · Penulis: ${a}`,
    tts_label: "🔊 Dengarkan Contoh (TTS)",
    tts_normal: "▶️ Kecepatan Normal (1.0x)",
    tts_slow: "🐢 Lebih Lambat (0.8x)",
    tts_stop: "⏹️ Berhenti",
    lbl_vad_state: "Status Pengukuran",
    vad_ready: "Siap — Tekan [Mulai Rekam] di bawah lalu mulai membaca",
    vad_listening: "🎤 Siap! Waktu akan mulai otomatis saat Anda mengucapkan kata pertama...",
    vad_speaking: "🔴 Suara terdeteksi — Mengukur kecepatan & akurasi!",
    vad_cancelled: "Rekaman dibatalkan.",
    vad_analyzing: "⏳ Menyimpan rekaman & menganalisis akurasi pelafalan...",
    vad_done: "✅ Pengukuran Selesai!",
    vad_fail: "Gagal mengirim",
    lbl_speech_time: "Durasi Bicara Murni",
    sec_unit: " dtk",
    recognized_prefix: "Teks terdeteksi",
    lbl_public_check: "Publikasikan rekaman saya agar pelajar lain dapat mendengarkannya",
    btn_start: "🎙️ Mulai Rekam",
    btn_stop: "⏹️ Selesai · Nilai Sekarang",
    btn_cancel: "Batal",
    btn_prev_in_group: "⬅️ Materi Sebelumnya",
    btn_next_in_group: "Materi Berikutnya ➡️",
    report_title: "📊 Laporan Evaluasi Membaca",
    badge_public: "Dipublikasikan",
    badge_private: "Pribadi",
    stat_acc: "Akurasi Pelafalan",
    stat_speed: "Kecepatan Baca (CPM)",
    stat_time: "Waktu Bicara Murni",
    diff_guide: "Analisis per Kata (Hijau: Tepat / Merah: Terlewat/Kurang Tepat)",
    recognized_text_lbl: "Teks yang Dikenali",
    btn_retry: "🔄 Coba Lagi",
    lbl_pub_passage: "Pilih Materi",
    lbl_pub_sort: "Urutkan",
    opt_all_public: "🌐 Semua Rekaman Publik",
    sort_recent: "Terbaru",
    sort_accuracy: "Akurasi Tertinggi",
    sort_speed: "Kecepatan Baca (CPM)",
    empty_public: "Belum ada rekaman publik. Jadilah yang pertama membagikan rekaman Anda!",
    acc_lbl: "Akurasi",
    speed_lbl: "Kecepatan",
    my_login_req: "Silakan masuk untuk melihat dan mengelola riwayat rekaman membaca Anda.",
    empty_my: "Anda belum memiliki riwayat tes membaca.",
    btn_make_private: "🌐 Publik (Ubah ke Pribadi)",
    btn_make_public: "🔒 Pribadi (Publikasikan)",
    btn_delete: "🗑️ Hapus",
    btn_edit: "✏️ Edit",
    grp_sec_title: "📁 Kelola Grup Materi Bacaan",
    btn_toggle_grp: "+ Tambah Grup / Lihat Daftar",
    lbl_grp_name: "Nama Grup (Korea)",
    lbl_grp_name_id: "Nama Grup (Indonesia, Opsional)",
    lbl_grp_desc: "Deskripsi Grup (Opsional)",
    btn_grp_save: "Simpan Grup",
    edit_box_title: "✏️ Edit Materi Bacaan",
    btn_close: "Tutup",
    new_box_title: "Tambah Materi Bacaan Baru",
    lbl_group: "Grup Materi",
    lbl_order: "Urutan",
    opt_no_group: "Tanpa Grup (Materi Tunggal)",
    lbl_title: "Judul",
    lbl_level: "Tingkat",
    lbl_tags: "Tag (pisahkan dengan koma)",
    lbl_content: "Teks Bacaan",
    btn_save_edit: "Simpan Perubahan",
    btn_create_passage: "Simpan Materi",
    all_groups_admin: "Semua Grup Materi",
    ph_admin_search: "Cari judul materi terdaftar...",
  },
};

function getKrLang() {
  return (typeof currentSiteLang !== "undefined" && currentSiteLang === "id") ? "id" : "ko";
}

function tKr(key) {
  const lang = getKrLang();
  return (KR_I18N[lang] && KR_I18N[lang][key]) || KR_I18N.ko[key] || key;
}

function formatKrLevel(level) {
  if (getKrLang() !== "id") return level;
  if (level === "초급") return KR_I18N.id.level_beginner;
  if (level === "중급") return KR_I18N.id.level_intermediate;
  if (level === "고급") return KR_I18N.id.level_advanced;
  return level;
}

function getGroupDisplayName(g) {
  if (!g) return "";
  return getKrLang() === "id" ? (g.title_id || g.title) : g.title;
}

function applyKreadingLanguage() {
  const setText = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.textContent = tKr(key);
  };
  const setPh = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.placeholder = tKr(key);
  };

  setText("kr-tab-test", "tab_test");
  setText("kr-tab-public", "tab_public");
  setText("kr-tab-my", "tab_my");
  setText("kr-tab-admin", "tab_admin");

  setPh("kr-filter-tag", "ph_tag");
  setPh("kr-filter-q", "ph_search_title");
  setPh("kr-admin-filter-q", "ph_admin_search");

  setText("kr-tts-label", "tts_label");
  setText("kr-btn-tts-normal", "tts_normal");
  setText("kr-btn-tts-slow", "tts_slow");
  setText("kr-btn-tts-stop", "tts_stop");
  setText("kr-lbl-vad-state", "lbl_vad_state");
  setText("kr-lbl-speech-time", "lbl_speech_time");
  setText("kr-lbl-public-check", "lbl_public_check");
  setText("kr-btn-start", "btn_start");
  setText("kr-btn-stop", "btn_stop");
  setText("kr-btn-cancel", "btn_cancel");
  setText("kr-btn-prev-in-group", "btn_prev_in_group");
  setText("kr-btn-next-in-group", "btn_next_in_group");

  setText("kr-lbl-pub-passage", "lbl_pub_passage");
  setText("kr-lbl-pub-sort", "lbl_pub_sort");

  setText("kr-grp-section-title", "grp_sec_title");
  setText("kr-btn-toggle-grp-form", "btn_toggle_grp");
  setText("kr-lbl-grp-name", "lbl_grp_name");
  setText("kr-lbl-grp-name-id", "lbl_grp_name_id");
  setText("kr-lbl-grp-level", "lbl_level");
  setText("kr-lbl-grp-desc", "lbl_grp_desc");
  setText("kr-lbl-grp-tags", "lbl_tags");
  setText("kr-btn-grp-submit", "btn_grp_save");
  setText("kr-btn-grp-cancel", "btn_cancel");

  setText("kr-edit-box-title", "edit_box_title");
  setText("kr-btn-edit-close", "btn_close");
  setText("kr-lbl-edit-group", "lbl_group");
  setText("kr-lbl-edit-order", "lbl_order");
  setText("kr-lbl-edit-title", "lbl_title");
  setText("kr-lbl-edit-level", "lbl_level");
  setText("kr-lbl-edit-tags", "lbl_tags");
  setText("kr-lbl-edit-content", "lbl_content");
  setText("kr-btn-edit-save", "btn_save_edit");
  setText("kr-btn-edit-cancel", "btn_cancel");

  setText("kr-new-box-title", "new_box_title");
  setText("kr-lbl-new-group", "lbl_group");
  setText("kr-lbl-new-order", "lbl_order");
  setText("kr-lbl-new-title", "lbl_title");
  setText("kr-lbl-new-level", "lbl_level");
  setText("kr-lbl-new-tags", "lbl_tags");
  setText("kr-lbl-new-content", "lbl_content");
  setText("kr-btn-new-submit", "btn_create_passage");

  const levelSel = document.getElementById("kr-filter-level");
  if (levelSel && levelSel.options.length >= 4) {
    levelSel.options[0].textContent = tKr("all_levels");
    levelSel.options[1].textContent = tKr("level_beginner");
    levelSel.options[2].textContent = tKr("level_intermediate");
    levelSel.options[3].textContent = tKr("level_advanced");
  }

  const sortSel = document.getElementById("kr-public-sort");
  if (sortSel && sortSel.options.length >= 3) {
    sortSel.options[0].textContent = tKr("sort_recent");
    sortSel.options[1].textContent = tKr("sort_accuracy");
    sortSel.options[2].textContent = tKr("sort_speed");
  }

  const testPs = document.getElementById("kr-test-pagesize");
  if (testPs && testPs.options.length >= 3) {
    testPs.options[0].textContent = tKr("page_unit_5");
    testPs.options[1].textContent = tKr("page_unit_10");
    testPs.options[2].textContent = tKr("page_unit_20");
  }
  const adminPs = document.getElementById("kr-admin-pagesize");
  if (adminPs && adminPs.options.length >= 3) {
    adminPs.options[0].textContent = tKr("page_unit_10");
    adminPs.options[1].textContent = tKr("page_unit_20");
    adminPs.options[2].textContent = tKr("page_unit_50");
  }

  renderGroupDropdowns();
  renderAdminGroupList();
}

function isReadingStaffUser() {
  if (!currentUser) return false;
  const g = String(currentUser.grade || "").trim().toUpperCase();
  return g === "ADMIN" || g === "TEACHER";
}

async function initKoreanReadingModule() {
  cleanupReadingAudioEngine();
  stopReadingTts();

  const token = localStorage.getItem("access_token");
  if (!currentUser && token) {
    try {
      const res = await fetch("/api/v1/auth/me", { headers: getAuthHeaders(false) });
      if (res.ok) currentUser = await res.json();
    } catch (e) {
      console.error(e);
    }
  }

  const isStaff = isReadingStaffUser();
  document.querySelectorAll(".kreading-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  await loadReadingGroups();
  applyKreadingLanguage();
  switchKreadingTab("test");
}

function switchKreadingTab(tabName) {
  krActiveTab = tabName;
  clearMsg();
  cleanupReadingAudioEngine();
  stopReadingTts();

  const tabs = ["test", "public", "my", "admin"];
  tabs.forEach(t => {
    const btn = document.getElementById(`kr-tab-${t}`);
    const view = document.getElementById(`kr-view-${t}`);
    if (btn) {
      btn.className = t === tabName
        ? (t === "admin" ? "kreading-staff-only" : "")
        : (t === "admin" ? "secondary kreading-staff-only" : "secondary");
    }
    if (view) view.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "test") {
    loadKreadingPassages(1);
  } else if (tabName === "public") {
    populatePublicPassageSelector();
  } else if (tabName === "my") {
    loadMyReadingAttempts();
  } else if (tabName === "admin") {
    loadAdminReadingPassages(1);
  }
}

/* =========================================================
   그룹 목록 조회 및 드롭다운 동기화
========================================================= */
async function loadReadingGroups() {
  const res = await fetch("/api/v1/modules/korean_reading/groups", {
    headers: getAuthHeaders(false),
  });
  kreadingGroupsCache = res.ok ? await res.json() : [];
  renderGroupDropdowns();
  renderAdminGroupList();
}

function renderGroupDropdowns() {
  const groupOpts = kreadingGroupsCache
    .map(g => `<option value="${g.id}">📁 [${formatKrLevel(g.level)}] ${getGroupDisplayName(g)}</option>`)
    .join("");

  const testFilter = document.getElementById("kr-filter-group");
  if (testFilter) {
    const prev = testFilter.value;
    testFilter.innerHTML =
      `<option value="">${tKr("all_groups")}</option>` +
      groupOpts +
      `<option value="UNGROUPED">${tKr("ungrouped")}</option>`;
    if ([...testFilter.options].some(o => o.value === prev)) testFilter.value = prev;
  }

  const adminFilter = document.getElementById("kr-admin-filter-group");
  if (adminFilter) {
    const prev = adminFilter.value;
    adminFilter.innerHTML =
      `<option value="">${tKr("all_groups_admin")}</option>` +
      groupOpts +
      `<option value="UNGROUPED">${tKr("ungrouped")}</option>`;
    if ([...adminFilter.options].some(o => o.value === prev)) adminFilter.value = prev;
  }

  ["kr-new-group", "kr-edit-group"].forEach(selId => {
    const sel = document.getElementById(selId);
    if (sel) {
      const prev = sel.value;
      sel.innerHTML = `<option value="">${tKr("opt_no_group")}</option>` + groupOpts;
      if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
    }
  });
}

function resetKreadingGroupFilter() {
  const testFilter = document.getElementById("kr-filter-group");
  if (testFilter) {
    testFilter.value = "";
    loadKreadingPassages(1);
  }
}

function toggleGroupManagerPanel() {
  const body = document.getElementById("kr-group-manager-body");
  if (body) body.classList.toggle("hidden");
}

function renderAdminGroupList() {
  const container = document.getElementById("kr-admin-group-list");
  if (!container) return;
  if (!kreadingGroupsCache.length) {
    container.innerHTML = `<div style="font-size:12.5px; color:#64748b; padding:6px;">등록된 그룹이 없습니다.</div>`;
    return;
  }
  container.innerHTML = kreadingGroupsCache
    .map(
      g => `
      <div style="background:#fff; border:1px solid #e9d5ff; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <span class="pos-badge">${formatKrLevel(g.level)}</span>
          <strong style="color:#581c87; margin-left:6px;">${g.title}</strong>
          ${g.title_id ? `<span style="font-size:12.5px; color:#64748b; margin-left:6px;">(${g.title_id})</span>` : ""}
          ${g.description ? `<div style="font-size:12px; color:#64748b; margin-top:2px;">${g.description}</div>` : ""}
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" style="background:#0284c7; padding:4px 9px; font-size:12px;" onclick="startEditReadingGroup('${g.id}')">${tKr("btn_edit")}</button>
          <button type="button" style="background:#dc2626; padding:4px 9px; font-size:12px;" onclick="deleteReadingGroup('${g.id}')">${tKr("btn_delete")}</button>
        </div>
      </div>
    `
    )
    .join("");
}

function startEditReadingGroup(groupId) {
  const g = kreadingGroupsCache.find(item => String(item.id) === String(groupId));
  if (!g) return;
  document.getElementById("kr-grp-edit-id").value = g.id;
  document.getElementById("kr-grp-title").value = g.title || "";
  document.getElementById("kr-grp-title-id").value = g.title_id || "";
  document.getElementById("kr-grp-level").value = g.level || "초급";
  document.getElementById("kr-grp-desc").value = g.description || "";
  document.getElementById("kr-grp-tags").value = (g.tags || []).join(", ");
  document.getElementById("kr-btn-grp-cancel").classList.remove("hidden");
}

function resetGroupForm() {
  document.getElementById("kr-grp-edit-id").value = "";
  document.getElementById("kr-grp-title").value = "";
  document.getElementById("kr-grp-title-id").value = "";
  document.getElementById("kr-grp-level").value = "초급";
  document.getElementById("kr-grp-desc").value = "";
  document.getElementById("kr-grp-tags").value = "";
  document.getElementById("kr-btn-grp-cancel").classList.add("hidden");
}

async function handleSaveReadingGroup(e) {
  e.preventDefault();
  clearMsg();
  const editId = document.getElementById("kr-grp-edit-id").value;
  const payload = {
    title: document.getElementById("kr-grp-title").value.trim(),
    title_id: document.getElementById("kr-grp-title-id").value.trim() || null,
    level: document.getElementById("kr-grp-level").value,
    description: document.getElementById("kr-grp-desc").value.trim(),
    tags: document.getElementById("kr-grp-tags").value.split(",").map(t => t.trim()).filter(Boolean),
  };

  const url = editId
    ? `/api/v1/modules/korean_reading/groups/${editId}`
    : "/api/v1/modules/korean_reading/groups";
  const res = await fetch(url, {
    method: editId ? "PATCH" : "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "그룹 저장 실패", true);

  resetGroupForm();
  showMsg(editId ? "그룹이 수정되었습니다." : "새 그룹이 추가되었습니다.");
  await loadReadingGroups();
}

async function deleteReadingGroup(groupId) {
  if (!confirm("이 그룹을 삭제하시겠습니까? 소속 지문은 삭제되지 않고 단독 지문으로 유지됩니다.")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/groups/${groupId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("그룹 삭제 실패", true);
  showMsg("그룹이 삭제되었습니다.");
  await loadReadingGroups();
  loadAdminReadingPassages(krAdminPage);
}

/* =========================================================
   TTS 들어보기
========================================================= */
function speakActiveReadingPassage(rate = 1.0) {
  if (!selectedReadingPassage || !selectedReadingPassage.content) return;
  if (!("speechSynthesis" in window)) {
    return showMsg("현재 브라우저에서는 TTS 음성 합성을 지원하지 않습니다.", true);
  }

  stopReadingTts();

  const utterance = new SpeechSynthesisUtterance(selectedReadingPassage.content);
  utterance.lang = "ko-KR";
  utterance.rate = rate;
  utterance.pitch = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find(v => v.lang && v.lang.toLowerCase().includes("ko"));
  if (koVoice) utterance.voice = koVoice;

  const stopBtn = document.getElementById("kr-btn-tts-stop");
  utterance.onstart = () => { if (stopBtn) stopBtn.classList.remove("hidden"); };
  utterance.onend = () => { if (stopBtn) stopBtn.classList.add("hidden"); };
  utterance.onerror = () => { if (stopBtn) stopBtn.classList.add("hidden"); };

  window.speechSynthesis.speak(utterance);
}

function stopReadingTts() {
  if ("speechSynthesis" in window) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  const stopBtn = document.getElementById("kr-btn-tts-stop");
  if (stopBtn) stopBtn.classList.add("hidden");
}

/* =========================================================
   탭 1: 읽기 지문 목록 (단일 그룹 필터 + 페이지네이션) & 테스트
========================================================= */
async function loadKreadingPassages(page = 1) {
  const groupId = document.getElementById("kr-filter-group")?.value || "";
  const level = document.getElementById("kr-filter-level")?.value || "";
  const tag = document.getElementById("kr-filter-tag")?.value.trim() || "";
  const q = document.getElementById("kr-filter-q")?.value.trim() || "";

  // 선택된 단일 그룹 배너 표시/숨김
  const banner = document.getElementById("kr-selected-group-banner");
  if (banner) {
    const selectedGrp = kreadingGroupsCache.find(g => String(g.id) === String(groupId));
    if (selectedGrp) {
      document.getElementById("kr-banner-group-title").textContent =
        `📁 [${formatKrLevel(selectedGrp.level)}] ${getGroupDisplayName(selectedGrp)}`;
      const descEl = document.getElementById("kr-banner-group-desc");
      descEl.textContent = selectedGrp.description || "";
      descEl.classList.toggle("hidden", !selectedGrp.description);
      const resetBtn = banner.querySelector("button");
      if (resetBtn) resetBtn.textContent = tKr("btn_reset_group");
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }

  const params = new URLSearchParams();
  if (groupId) params.append("group_id", groupId);
  if (level) params.append("level", level);
  if (tag) params.append("tag", tag);
  if (q) params.append("q", q);

  const res = await fetch(`/api/v1/modules/korean_reading/passages?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  const listEl = document.getElementById("kr-passage-list");
  if (!res.ok) {
    listEl.innerHTML = `<p style="color:#b91c1c;">지문 목록을 불러오지 못했습니다.</p>`;
    return;
  }

  const items = await res.json();
  // 그룹 내 순서 우선 정렬
  items.sort((a, b) => (a.group_order || 1) - (b.group_order || 1));
  kreadingPassagesCache = items;

  renderKreadingPassagesPage(page);
}

function renderKreadingPassagesPage(page = 1) {
  krTestPage = page;
  const pageSize = parseInt(document.getElementById("kr-test-pagesize")?.value || "10", 10);
  const total = kreadingPassagesCache.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (krTestPage > totalPages) krTestPage = totalPages;

  const summaryEl = document.getElementById("kr-test-summary");
  if (summaryEl) {
    summaryEl.innerHTML = tKr("summary_fmt")(total, krTestPage, totalPages);
  }

  const listEl = document.getElementById("kr-passage-list");
  const pagEl = document.getElementById("kr-passage-pagination");

  if (!total) {
    listEl.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">${tKr("empty_passages")}</p>`;
    if (pagEl) pagEl.innerHTML = "";
    return;
  }

  const selectedGroupId = document.getElementById("kr-filter-group")?.value || "";
  const isSingleGroupSelected = Boolean(selectedGroupId && selectedGroupId !== "UNGROUPED");

  const start = (krTestPage - 1) * pageSize;
  const pagedItems = kreadingPassagesCache.slice(start, start + pageSize);

  listEl.innerHTML = pagedItems
    .map(p => {
      const grpName = getGroupDisplayName(p.reading_passage_groups);
      const orderBadge = isSingleGroupSelected
        ? `<span class="tag" style="background:#ede9fe; color:#5b21b6; margin-right:4px;">${tKr("order_badge_fmt")(p.group_order || 1)}</span>`
        : "";
      const groupBadge = !isSingleGroupSelected && grpName
        ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8; margin-left:4px;">📁 ${grpName}</span>`
        : "";

      return `
        <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
          <div>
            <div>
              ${orderBadge}
              <span class="pos-badge">${formatKrLevel(p.level)}</span>
              ${groupBadge}
              <strong style="font-size:15px; color:#0f172a; margin-left:6px;">${p.title}</strong>
              ${(p.tags || []).map(t => `<span class="tag" style="margin-left:4px;">#${t}</span>`).join("")}
            </div>
            <div style="font-size:12.5px; color:#64748b; margin-top:4px;">
              ${tKr("meta_fmt")(p.char_count, p.word_count, p.author_name || "선생님")}
            </div>
          </div>
          <button type="button" style="background:#2563eb; padding:8px 14px;" onclick="selectReadingPassageForTest('${p.id}')">
            ${tKr("btn_read_this")}
          </button>
        </div>
      `;
    })
    .join("");

  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(krTestPage, totalPages, "renderKreadingPassagesPage");
  }
}

function selectReadingPassageForTest(passageId) {
  cleanupReadingAudioEngine();
  stopReadingTts();

  const p = kreadingPassagesCache.find(item => String(item.id) === String(passageId));
  if (!p) return;

  selectedReadingPassage = p;
  document.getElementById("kr-active-level").textContent = formatKrLevel(p.level);

  const grpEl = document.getElementById("kr-active-group");
  const grpName = getGroupDisplayName(p.reading_passage_groups);
  if (grpEl) {
    if (grpName) {
      grpEl.textContent = `📁 ${grpName} (${tKr("order_badge_fmt")(p.group_order || 1)})`;
      grpEl.classList.remove("hidden");
    } else {
      grpEl.classList.add("hidden");
    }
  }

  document.getElementById("kr-active-title").textContent = p.title;
  document.getElementById("kr-active-meta").innerHTML = tKr("active_meta_fmt")(
    p.char_count,
    p.word_count,
    p.author_name || "선생님"
  );
  document.getElementById("kr-active-content").textContent = p.content;

  document.getElementById("kr-vad-status").textContent = tKr("vad_ready");
  document.getElementById("kr-vad-status").style.color = "#38bdf8";
  document.getElementById("kr-live-timer").textContent = `0.00${tKr("sec_unit")}`;
  document.getElementById("kr-live-transcript").textContent = "";
  document.getElementById("kr-volume-bar").style.width = "0%";

  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
  document.getElementById("kr-result-box").classList.add("hidden");

  updateReadingGroupNavBar();

  const studio = document.getElementById("kr-studio-box");
  studio.classList.remove("hidden");
  studio.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function getSiblingsInSameReadingGroup() {
  if (!selectedReadingPassage || !selectedReadingPassage.group_id) return [];
  return kreadingPassagesCache
    .filter(item => String(item.group_id) === String(selectedReadingPassage.group_id))
    .sort((a, b) => (a.group_order || 1) - (b.group_order || 1));
}

function updateReadingGroupNavBar() {
  const navBar = document.getElementById("kr-group-nav-bar");
  if (!navBar) return;

  const siblings = getSiblingsInSameReadingGroup();
  if (siblings.length <= 1) {
    navBar.classList.add("hidden");
    return;
  }

  const idx = siblings.findIndex(item => String(item.id) === String(selectedReadingPassage.id));
  navBar.classList.remove("hidden");

  const prevBtn = document.getElementById("kr-btn-prev-in-group");
  const nextBtn = document.getElementById("kr-btn-next-in-group");
  const labelEl = document.getElementById("kr-group-nav-label");

  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx < 0 || idx >= siblings.length - 1;
  if (labelEl) {
    const grpTitle = getGroupDisplayName(selectedReadingPassage.reading_passage_groups) || "Group";
    labelEl.textContent = `📁 ${grpTitle} (${idx + 1} / ${siblings.length})`;
  }
}

function navigateInReadingGroup(delta) {
  const siblings = getSiblingsInSameReadingGroup();
  if (!siblings.length) return;
  const idx = siblings.findIndex(item => String(item.id) === String(selectedReadingPassage.id));
  const nextIdx = idx + delta;
  if (nextIdx >= 0 && nextIdx < siblings.length) {
    selectReadingPassageForTest(siblings[nextIdx].id);
  }
}

async function startReadingRecording() {
  if (!selectedReadingPassage) return;
  clearMsg();
  cleanupReadingAudioEngine();
  stopReadingTts();

  try {
    krMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    return showMsg("마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요.", true);
  }

  krRecordedChunks = [];
  krFinalTranscript = "";
  krInterimTranscript = "";
  krIsRecording = true;
  krSpeechStarted = false;
  krActualStartMs = 0;
  krLastSpeechMs = 0;

  const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];
  let chosenMime = "";
  for (const m of mimeCandidates) {
    if (!m || (window.MediaRecorder && MediaRecorder.isTypeSupported(m))) {
      chosenMime = m;
      break;
    }
  }
  krMediaRecorder = chosenMime
    ? new MediaRecorder(krMediaStream, { mimeType: chosenMime })
    : new MediaRecorder(krMediaStream);

  krMediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) krRecordedChunks.push(e.data);
  };
  krMediaRecorder.start(100);

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    krSpeechRecognition = new SpeechRec();
    krSpeechRecognition.lang = "ko-KR";
    krSpeechRecognition.continuous = true;
    krSpeechRecognition.interimResults = true;

    krSpeechRecognition.onresult = event => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const txt = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          krFinalTranscript += txt + " ";
        } else {
          interim += txt;
        }
      }
      krInterimTranscript = interim;
      const now = performance.now();
      if (!krSpeechStarted && (krFinalTranscript.trim() || interim.trim())) {
        krSpeechStarted = true;
        krActualStartMs = now;
      }
      if (krSpeechStarted) {
        krLastSpeechMs = now;
      }
      const el = document.getElementById("kr-live-transcript");
      if (el) el.textContent = `${tKr("recognized_prefix")}: ${(krFinalTranscript + krInterimTranscript).trim()}`;
    };

    krSpeechRecognition.onerror = () => {};
    krSpeechRecognition.onend = () => {
      if (krIsRecording) {
        try { krSpeechRecognition.start(); } catch {}
      }
    };
    try { krSpeechRecognition.start(); } catch {}
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  krAudioContext = new AudioCtx();
  const source = krAudioContext.createMediaStreamSource(krMediaStream);
  krAnalyser = krAudioContext.createAnalyser();
  krAnalyser.fftSize = 512;
  source.connect(krAnalyser);

  const dataArray = new Uint8Array(krAnalyser.fftSize);
  const statusEl = document.getElementById("kr-vad-status");
  const timerEl = document.getElementById("kr-live-timer");
  const volBar = document.getElementById("kr-volume-bar");

  statusEl.textContent = tKr("vad_listening");
  statusEl.style.color = "#fbbf24";

  document.getElementById("kr-btn-start").classList.add("hidden");
  document.getElementById("kr-btn-stop").classList.remove("hidden");
  document.getElementById("kr-btn-cancel").classList.remove("hidden");

  const SPEECH_THRESHOLD = 0.028;

  function monitorAudioLoop() {
    if (!krIsRecording) return;

    krAnalyser.getByteTimeDomainData(dataArray);
    let sumSq = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const norm = (dataArray[i] - 128) / 128;
      sumSq += norm * norm;
    }
    const rms = Math.sqrt(sumSq / dataArray.length);
    const pct = Math.min(100, Math.round(rms * 450));
    if (volBar) volBar.style.width = `${pct}%`;

    const now = performance.now();
    if (rms >= SPEECH_THRESHOLD) {
      if (!krSpeechStarted) {
        krSpeechStarted = true;
        krActualStartMs = now;
        statusEl.textContent = tKr("vad_speaking");
        statusEl.style.color = "#4ade80";
      }
      krLastSpeechMs = now;
    }

    if (krSpeechStarted && timerEl) {
      const pureElapsedSec = Math.max(0, (krLastSpeechMs - krActualStartMs) / 1000);
      timerEl.textContent = `${pureElapsedSec.toFixed(2)}${tKr("sec_unit")}`;
    }

    krVadAnimId = requestAnimationFrame(monitorAudioLoop);
  }
  krVadAnimId = requestAnimationFrame(monitorAudioLoop);
}

function cancelReadingRecording() {
  cleanupReadingAudioEngine();
  document.getElementById("kr-vad-status").textContent = tKr("vad_cancelled");
  document.getElementById("kr-vad-status").style.color = "#94a3b8";
  document.getElementById("kr-live-timer").textContent = `0.00${tKr("sec_unit")}`;
  document.getElementById("kr-volume-bar").style.width = "0%";
  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");
}

async function stopAndSubmitReading() {
  if (!krIsRecording || !selectedReadingPassage) return;

  if (!krSpeechStarted || krLastSpeechMs <= krActualStartMs) {
    cleanupReadingAudioEngine();
    document.getElementById("kr-btn-start").classList.remove("hidden");
    document.getElementById("kr-btn-stop").classList.add("hidden");
    document.getElementById("kr-btn-cancel").classList.add("hidden");
    return showMsg("실제 음성이 감지되지 않았습니다. 마이크에 가까이 대고 다시 읽어주세요.", true);
  }

  const pureDurationSec = Math.max(0.3, (krLastSpeechMs - krActualStartMs) / 1000);
  const fullTranscript = (krFinalTranscript + " " + krInterimTranscript).trim();
  const isPublic = Boolean(document.getElementById("kr-submit-public")?.checked);

  const statusEl = document.getElementById("kr-vad-status");
  statusEl.textContent = tKr("vad_analyzing");
  statusEl.style.color = "#38bdf8";

  const audioBlob = await new Promise(resolve => {
    const mimeType = (krMediaRecorder && krMediaRecorder.mimeType) || "audio/webm";
    krMediaRecorder.onstop = () => {
      resolve(new Blob(krRecordedChunks, { type: mimeType }));
    };
    krMediaRecorder.stop();
  });

  cleanupReadingAudioEngine();

  document.getElementById("kr-btn-start").classList.remove("hidden");
  document.getElementById("kr-btn-stop").classList.add("hidden");
  document.getElementById("kr-btn-cancel").classList.add("hidden");

  const ext = audioBlob.type.includes("mp4") ? ".mp4" : ".webm";
  const formData = new FormData();
  formData.append("passage_id", selectedReadingPassage.id);
  formData.append("duration_seconds", pureDurationSec.toFixed(2));
  formData.append("recognized_text", fullTranscript);
  formData.append("is_public", String(isPublic));
  formData.append("audio_file", audioBlob, `reading_${Date.now()}${ext}`);

  const res = await fetch("/api/v1/modules/korean_reading/submit", {
    method: "POST",
    headers: getAuthHeaders(false),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) {
    statusEl.textContent = tKr("vad_fail");
    return showMsg(data.detail || "채점 저장 오류", true);
  }

  statusEl.textContent = tKr("vad_done");
  statusEl.style.color = "#4ade80";
  renderReadingResultReport(data);
}

function renderReadingResultReport(data) {
  const box = document.getElementById("kr-result-box");
  box.classList.remove("hidden");

  const diffHtml = (data.diff_tokens || [])
    .map(
      tok => `
    <span style="display:inline-block; padding:2px 5px; margin:2px; border-radius:4px; font-weight:700; ${
      tok.matched
        ? "background:#dcfce7; color:#166534;"
        : "background:#fee2e2; color:#b91c1c; text-decoration:underline wavy #dc2626;"
    }">${tok.word}</span>
  `
    )
    .join(" ");

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
      <strong style="font-size:16px; color:#14532d;">${tKr("report_title")} — ${data.passage_title || ""}</strong>
      <span class="tag" style="background:${data.is_public ? "#2563eb" : "#475569"}; color:#fff;">
        ${data.is_public ? tKr("badge_public") : tKr("badge_private")}
      </span>
    </div>

    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:12px;">
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">${tKr("stat_acc")}</div>
        <div style="font-size:26px; font-weight:900; color:#16a34a;">${data.accuracy_score}%</div>
      </div>
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">${tKr("stat_speed")}</div>
        <div style="font-size:26px; font-weight:900; color:#2563eb;">${data.cpm} <span style="font-size:13px;">CPM</span></div>
      </div>
      <div style="background:#fff; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
        <div style="font-size:12px; color:#64748b;">${tKr("stat_time")}</div>
        <div style="font-size:26px; font-weight:900; color:#0f172a;">${data.duration_seconds}${tKr("sec_unit")}</div>
      </div>
    </div>

    <div style="background:#fff; padding:12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px;">
      <div style="font-size:12px; color:#64748b; margin-bottom:6px;">${tKr("diff_guide")}</div>
      <div style="font-size:15px; line-height:1.8;">${diffHtml}</div>
      ${data.recognized_text ? `<div style="margin-top:8px; font-size:12.5px; color:#475569;"><b>${tKr("recognized_text_lbl")}:</b> ${data.recognized_text}</div>` : ""}
    </div>

    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
      <audio controls src="${data.audio_url}" style="height:36px; flex:1; min-width:220px;"></audio>
      <button type="button" style="background:#0284c7;" onclick="selectReadingPassageForTest('${data.passage_id}')">
        ${tKr("btn_retry")}
      </button>
    </div>
  `;
}

function cleanupReadingAudioEngine() {
  krIsRecording = false;
  if (krVadAnimId) { cancelAnimationFrame(krVadAnimId); krVadAnimId = null; }
  if (krSilenceAutoStopTimer) { clearTimeout(krSilenceAutoStopTimer); krSilenceAutoStopTimer = null; }
  if (krSpeechRecognition) { try { krSpeechRecognition.stop(); } catch {} krSpeechRecognition = null; }
  if (krMediaRecorder && krMediaRecorder.state !== "inactive") { try { krMediaRecorder.stop(); } catch {} }
  if (krMediaStream) { krMediaStream.getTracks().forEach(t => t.stop()); krMediaStream = null; }
  if (krAudioContext) { try { krAudioContext.close(); } catch {} krAudioContext = null; }
}

/* =========================================================
   탭 2: 공개 기록 듣기 & 랭킹
========================================================= */
async function populatePublicPassageSelector() {
  const res = await fetch("/api/v1/modules/korean_reading/passages", { headers: getAuthHeaders(false) });
  const allList = res.ok ? await res.json() : kreadingPassagesCache;

  const sel = document.getElementById("kr-public-passage-select");
  const allOption = `<option value="ALL">${tKr("opt_all_public")}</option>`;
  const passageOptions = allList
    .map(p => {
      const grpName = getGroupDisplayName(p.reading_passage_groups);
      const grpPrefix = grpName ? `[${grpName}] ` : "";
      return `<option value="${p.id}">${grpPrefix}[${formatKrLevel(p.level)}] ${p.title}</option>`;
    })
    .join("");

  sel.innerHTML = allOption + passageOptions;
  sel.value = "ALL";
  loadPublicAttemptsForSelectedPassage();
}

async function loadPublicAttemptsForSelectedPassage() {
  const passageId = document.getElementById("kr-public-passage-select")?.value || "ALL";
  const sortBy = document.getElementById("kr-public-sort")?.value || "recent";
  const container = document.getElementById("kr-public-attempts-list");

  const endpoint =
    passageId === "ALL"
      ? `/api/v1/modules/korean_reading/public-attempts?sort_by=${sortBy}`
      : `/api/v1/modules/korean_reading/passages/${passageId}/public-attempts?sort_by=${sortBy}`;

  const res = await fetch(endpoint, { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">공개 기록을 불러오지 못했습니다.</p>`;
    return;
  }

  const items = await res.json();
  if (!items.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">${tKr("empty_public")}</p>`;
    return;
  }

  container.innerHTML = items
    .map((item, idx) => {
      const pInfo = item.reading_passages;
      const pBadge = pInfo
        ? `<span class="pos-badge" style="margin-left:6px;">[${formatKrLevel(pInfo.level)}] ${pInfo.title}</span>`
        : "";

      return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <span class="tag" style="background:${idx === 0 ? "#f59e0b" : "#334155"}; color:#fff;">#${idx + 1}</span>
            <strong style="font-size:15px; margin-left:6px;">${item.user_nickname}</strong>
            ${pBadge}
            <span style="font-size:12px; color:#64748b; margin-left:6px;">${new Date(item.created_at).toLocaleDateString()}</span>
          </div>
          <div style="font-size:13.5px;">
            ${tKr("acc_lbl")} <b style="color:#16a34a;">${item.accuracy_score}%</b> · ${tKr("speed_lbl")} <b style="color:#2563eb;">${item.cpm} CPM</b> (${item.duration_seconds}${tKr("sec_unit")})
          </div>
        </div>
        <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
      </div>
    `;
    })
    .join("");
}

/* =========================================================
   탭 3: 내 읽기 기록 & 공개/비공개 전환 & 삭제
========================================================= */
async function loadMyReadingAttempts() {
  const container = document.getElementById("kr-my-attempts-list");
  if (!currentUser) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">${tKr("my_login_req")}</p>`;
    return;
  }

  const res = await fetch("/api/v1/modules/korean_reading/my-attempts", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">내 기록을 불러오지 못했습니다.</p>`;
    return;
  }

  const items = await res.json();
  if (!items.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:24px;">${tKr("empty_my")}</p>`;
    return;
  }

  container.innerHTML = items
    .map(item => {
      const pTitle = item.reading_passages?.title || "지문";
      return `
      <div class="word-card" style="background:#fff; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
          <div>
            <strong>${pTitle}</strong>
            <span style="font-size:12px; color:#64748b; margin-left:6px;">${new Date(item.created_at).toLocaleString()}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="font-size:13px; margin-right:4px;">${tKr("acc_lbl")} <b>${item.accuracy_score}%</b> · <b>${item.cpm} CPM</b> (${item.duration_seconds}${tKr("sec_unit")})</span>
            <button type="button" class="${item.is_public ? "" : "secondary"}" style="padding:4px 10px; font-size:12px;" onclick="toggleMyReadingVisibility('${item.id}', ${!item.is_public})">
              ${item.is_public ? tKr("btn_make_private") : tKr("btn_make_public")}
            </button>
            <button type="button" style="background:#dc2626; padding:4px 10px; font-size:12px;" onclick="deleteMyReadingAttempt('${item.id}')">
              ${tKr("btn_delete")}
            </button>
          </div>
        </div>
        <audio controls src="${item.audio_url}" style="width:100%; height:36px;"></audio>
      </div>
    `;
    })
    .join("");
}

async function toggleMyReadingVisibility(attemptId, nextPublic) {
  const res = await fetch(`/api/v1/modules/korean_reading/attempts/${attemptId}/visibility`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ is_public: nextPublic }),
  });
  if (!res.ok) return showMsg("공개 설정 변경 실패", true);
  showMsg(nextPublic ? "기록이 공개되었습니다." : "기록이 비공개로 전환되었습니다.");
  loadMyReadingAttempts();
}

async function deleteMyReadingAttempt(attemptId) {
  if (!confirm("이 녹음 기록을 영구 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/attempts/${attemptId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return showMsg(data.detail || "녹음 삭제에 실패했습니다.", true);
  showMsg("녹음 기록이 삭제되었습니다.");
  loadMyReadingAttempts();
}

/* =========================================================
   탭 4: 지문 등록 · 수정 · 삭제 (단일 그룹 필터 + 페이지네이션)
========================================================= */
async function handleCreateReadingPassage(e) {
  e.preventDefault();
  clearMsg();

  const group_id = document.getElementById("kr-new-group").value || null;
  const group_order = parseInt(document.getElementById("kr-new-order").value || "1", 10);
  const title = document.getElementById("kr-new-title").value.trim();
  const level = document.getElementById("kr-new-level").value;
  const tags = document.getElementById("kr-new-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const content = document.getElementById("kr-new-content").value.trim();

  const res = await fetch("/api/v1/modules/korean_reading/passages", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ group_id, group_order, title, level, tags, content }),
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "지문 등록 실패", true);

  e.target.reset();
  showMsg("새 읽기 지문이 등록되었습니다!");
  loadAdminReadingPassages(1);
}

function openEditReadingPassage(passageId) {
  const p = kreadingAdminPassagesCache.find(item => String(item.id) === String(passageId));
  if (!p) return;

  document.getElementById("kr-edit-id").value = p.id;
  document.getElementById("kr-edit-group").value = p.group_id || "";
  document.getElementById("kr-edit-order").value = p.group_order || 1;
  document.getElementById("kr-edit-title").value = p.title || "";
  document.getElementById("kr-edit-level").value = p.level || "초급";
  document.getElementById("kr-edit-tags").value = (p.tags || []).join(", ");
  document.getElementById("kr-edit-content").value = p.content || "";

  const box = document.getElementById("kr-edit-passage-box");
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEditReadingPassage() {
  const box = document.getElementById("kr-edit-passage-box");
  if (box) box.classList.add("hidden");
}

async function handleUpdateReadingPassage(e) {
  e.preventDefault();
  clearMsg();

  const passageId = document.getElementById("kr-edit-id").value;
  const group_id = document.getElementById("kr-edit-group").value || null;
  const group_order = parseInt(document.getElementById("kr-edit-order").value || "1", 10);
  const title = document.getElementById("kr-edit-title").value.trim();
  const level = document.getElementById("kr-edit-level").value;
  const tags = document.getElementById("kr-edit-tags").value.split(",").map(t => t.trim()).filter(Boolean);
  const content = document.getElementById("kr-edit-content").value.trim();

  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify({ group_id, group_order, title, level, tags, content }),
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.detail || "지문 수정 실패", true);

  closeEditReadingPassage();
  showMsg("읽기 지문이 수정되었습니다.");
  loadAdminReadingPassages(krAdminPage);
}

async function loadAdminReadingPassages(page = 1) {
  const groupId = document.getElementById("kr-admin-filter-group")?.value || "";
  const q = document.getElementById("kr-admin-filter-q")?.value.trim() || "";

  const params = new URLSearchParams();
  if (groupId) params.append("group_id", groupId);
  if (q) params.append("q", q);

  const res = await fetch(`/api/v1/modules/korean_reading/passages?${params.toString()}`, {
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return;

  const items = await res.json();
  items.sort((a, b) => (a.group_order || 1) - (b.group_order || 1));
  kreadingAdminPassagesCache = items;

  renderAdminReadingPassagesPage(page);
}

function renderAdminReadingPassagesPage(page = 1) {
  krAdminPage = page;
  const pageSize = parseInt(document.getElementById("kr-admin-pagesize")?.value || "10", 10);
  const total = kreadingAdminPassagesCache.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (krAdminPage > totalPages) krAdminPage = totalPages;

  const summaryEl = document.getElementById("kr-admin-summary");
  if (summaryEl) {
    summaryEl.innerHTML = tKr("summary_fmt")(total, krAdminPage, totalPages);
  }

  const container = document.getElementById("kr-admin-passage-list");
  const pagEl = document.getElementById("kr-admin-passage-pagination");

  if (!total) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:16px;">${tKr("empty_passages")}</p>`;
    if (pagEl) pagEl.innerHTML = "";
    return;
  }

  const start = (krAdminPage - 1) * pageSize;
  const pagedItems = kreadingAdminPassagesCache.slice(start, start + pageSize);

  container.innerHTML = pagedItems
    .map(p => {
      const grpName = getGroupDisplayName(p.reading_passage_groups);
      return `
      <div class="word-card" style="background:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
        <div>
          <span class="pos-badge">${formatKrLevel(p.level)}</span>
          ${grpName ? `<span class="tag" style="background:#f3e8ff; color:#6b21a8; margin-left:4px;">📁 ${grpName} (#${p.group_order || 1})</span>` : ""}
          <strong style="margin-left:6px;">${p.title}</strong>
          <span style="font-size:12px; color:#64748b; margin-left:6px;">(${p.char_count}음절 · ${p.author_name || "선생님"})</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" style="background:#0284c7; padding:6px 10px; font-size:12px;" onclick="openEditReadingPassage('${p.id}')">${tKr("btn_edit")}</button>
          <button type="button" style="background:#dc2626; padding:6px 10px; font-size:12px;" onclick="deleteReadingPassage('${p.id}')">${tKr("btn_delete")}</button>
        </div>
      </div>
    `;
    })
    .join("");

  if (pagEl && typeof renderPaginationBar === "function") {
    pagEl.innerHTML = renderPaginationBar(krAdminPage, totalPages, "renderAdminReadingPassagesPage");
  }
}

async function deleteReadingPassage(passageId) {
  if (!confirm("이 지문과 연결된 기록을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_reading/passages/${passageId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) return showMsg("삭제 권한이 없거나 실패했습니다.", true);
  showMsg("지문이 삭제되었습니다.");
  loadAdminReadingPassages(krAdminPage);
}