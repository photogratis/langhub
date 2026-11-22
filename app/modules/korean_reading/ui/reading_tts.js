/* =========================================================
   korean_reading/ui/reading_tts.js
   - 브라우저 내장 Web Speech API(ko-KR) 무료 한국어 TTS 재생기
   ========================================================= */

function stopReadingTts() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function playKoreanTtsText(text, rate = 1.0) {
  if (!("speechSynthesis" in window)) {
    return showMsg("이 브라우저는 음성 합성(TTS)을 지원하지 않습니다.", true);
  }
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  stopReadingTts();

  const utter = new SpeechSynthesisUtterance(cleanText);
  utter.lang = "ko-KR";
  utter.rate = rate; // 1.0(보통), 0.75(천천히)
  utter.pitch = 1.0;

  // 한국어 음성이 로드되어 있으면 우선 지정
  const voices = window.speechSynthesis.getVoices();
  const koVoice = voices.find(v => v.lang && v.lang.toLowerCase().includes("ko"));
  if (koVoice) utter.voice = koVoice;

  window.speechSynthesis.speak(utter);
}

function playSelectedPassageTts(rate = 1.0) {
  if (!selectedReadingPassage || !selectedReadingPassage.content) return;
  playKoreanTtsText(selectedReadingPassage.content, rate);
}

function playPassageTtsById(passageId, rate = 1.0) {
  const p = (kreadingPassagesCache || []).find(item => item.id === passageId);
  if (!p) return;
  playKoreanTtsText(p.content, rate);
}