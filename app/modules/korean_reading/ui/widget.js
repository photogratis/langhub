var kreadingPassagesCache = [];
var selectedReadingPassage = null;
var krSubScriptsLoaded = false;

function isReadingStaffUser() {
  if (!currentUser) return false;
  const g = String(currentUser.grade || "").trim().toUpperCase();
  return g === "ADMIN" || g === "TEACHER";
}

function loadReadingSubScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

async function initKoreanReadingModule() {
  if (!krSubScriptsLoaded) {
    await Promise.all([
      loadReadingSubScript("/static/modules/korean_reading/reading_tts.js?v=2"),
      loadReadingSubScript("/static/modules/korean_reading/reading_passage_browser.js?v=2"),
      loadReadingSubScript("/static/modules/korean_reading/reading_studio.js?v=2"),
      loadReadingSubScript("/static/modules/korean_reading/reading_social.js?v=2"),
      loadReadingSubScript("/static/modules/korean_reading/reading_admin.js?v=2")
    ]);
    krSubScriptsLoaded = true;
  }

  if (typeof cleanupReadingAudioEngine === "function") cleanupReadingAudioEngine();

  const isStaff = isReadingStaffUser();
  document.querySelectorAll(".kreading-staff-only").forEach(el => {
    el.classList.toggle("hidden", !isStaff);
  });

  switchKreadingTab("test");
}

function switchKreadingTab(tabName) {
  if (typeof clearMsg === "function") clearMsg();
  if (typeof stopReadingTts === "function") stopReadingTts();
  if (typeof cleanupReadingAudioEngine === "function") cleanupReadingAudioEngine();

  ["test", "public", "my", "admin"].forEach(t => {
    const btn = document.getElementById(`kr-tab-${t}`);
    const view = document.getElementById(`kr-view-${t}`);
    if (btn) btn.className = t === tabName ? (t === "admin" ? "kreading-staff-only" : "") : (t === "admin" ? "secondary kreading-staff-only" : "secondary");
    if (view) view.classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "test") loadKreadingPassages();
  else if (tabName === "public") populatePublicPassageSelector();
  else if (tabName === "my") loadMyReadingAttempts();
  else if (tabName === "admin") loadAdminReadingPassages();
}