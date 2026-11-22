var analyzerTimer = null;

function initAnalyzerModule() {
  onTypingAnalyzer();
}

function renderJamoBadges(countMap, bgColor, textColor) {
  const entries = Object.entries(countMap || {});
  if (!entries.length) {
    return `<span style="color:#94a3b8;">없음</span>`;
  }
  return entries
    .map(([jamo, cnt]) => `<span class="tag" style="background:${bgColor}; color:${textColor}; font-size:13px; margin-bottom:4px;"><b>${jamo}</b> : ${cnt}개</span>`)
    .join(" ");
}

function onTypingAnalyzer() {
  clearTimeout(analyzerTimer);
  analyzerTimer = setTimeout(async () => {
    const inputEl = document.getElementById("analyzer-input");
    if (!inputEl) return;

    const text = inputEl.value;
    const res = await fetch("/api/v1/modules/hangul_analyzer/analyze", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      document.getElementById("analyzer-words").innerHTML = `<div style="padding:16px; color:#b91c1c; background:#fef2f2; border-radius:8px;">
        <b>접근 제한:</b> ${err.detail || "이 모듈을 사용할 권한이 없습니다."}
      </div>`;
      return;
    }

    const data = await res.json();

    document.getElementById("stat-with-space").textContent = `${data.total_chars_with_space}자`;
    document.getElementById("stat-without-space").textContent = `${data.total_chars_without_space}자`;
    document.getElementById("stat-syllable").textContent = `${data.hangul_syllable_count}자`;

    document.getElementById("stat-chosung").innerHTML = renderJamoBadges(data.chosung_counts, "#dbeafe", "#1e40af");
    document.getElementById("stat-jungsung").innerHTML = renderJamoBadges(data.jungsung_counts, "#d1fae5", "#065f46");
    document.getElementById("stat-jongsung").innerHTML = renderJamoBadges(data.jongsung_counts, "#fef3c7", "#92400e");

    const grammarBox = document.getElementById("analyzer-grammars");
    if (!data.matched_grammars || !data.matched_grammars.length) {
      grammarBox.innerHTML = `<p style="color:#64748b; font-size:13px;">문법사전 DB에서 일치하는 문법 패턴이 탐지되지 않았습니다.</p>`;
    } else {
      grammarBox.innerHTML = data.matched_grammars.map(g => `
        <div class="word-card" style="background:#faf5ff; border-color:#e9d5ff; margin-top:8px;">
          <strong style="color:#5b21b6; font-size:15px;">${g.pattern}</strong>
          <span class="pos-badge">${g.level}</span>
          <span style="margin-left:8px; font-weight:600; color:#2563eb;">${g.meaning_id}</span>
          ${g.usage_rule ? `<div style="font-size:12px; color:#475569; margin-top:4px;">${g.usage_rule}</div>` : ""}
        </div>
      `).join("");
    }

    const wordBox = document.getElementById("analyzer-words");
    if (!data.word_analyses || !data.word_analyses.length) {
      wordBox.innerHTML = `<p style="color:#64748b; font-size:13px;">분석할 어절이 없습니다.</p>`;
    } else {
      wordBox.innerHTML = data.word_analyses.map(w => `
        <div class="word-card" style="margin-top:8px;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <strong style="font-size:16px; color:#0f172a;">${w.token}</strong>
            <span style="color:#64748b; font-size:13px;">→ 기본형/어간: <b>${w.stem}</b></span>
            ${w.josa ? `<span class="tag" style="background:#fce7f3; color:#9d174d;">조사: <b>${w.josa}</b> (${w.josa_meaning_id})</span>` : ""}
          </div>
          <div style="margin-top:6px; font-size:13px;">
            ${(w.dict_matches && w.dict_matches.length)
              ? w.dict_matches.map(m => `
                  <div style="color:#1e293b;">
                    • <span class="pos-badge">${m.pos}</span> <b style="color:#2563eb;">${m.meaning_id}</b>
                  </div>
                `).join("")
              : `<span style="color:#94a3b8;">한-인사전 DB에 등록된 뜻이 없습니다.</span>`
            }
          </div>
        </div>
      `).join("");
    }
  }, 300);
}