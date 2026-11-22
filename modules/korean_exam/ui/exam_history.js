/* =========================================================
   korean_exam/ui/exam_history.js — 회차별 응시 기록 조회 및 삭제
   ========================================================= */

async function loadMyExamHistory() {
  const container = document.getElementById("ke-history-list");
  const detailBox = document.getElementById("ke-history-detail");
  detailBox.classList.add("hidden");

  if (!currentUser) {
    container.innerHTML = `
      <div style="text-align:center; padding:24px; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px;">
        <p style="color:#92400e; font-weight:700; margin:0 0 8px 0;">로그인한 회원만 응시 기록 및 오답 반복 재시험 기능을 이용할 수 있습니다.</p>
        <button type="button" style="background:#d97706;" onclick="openAuthModalForExam()">로그인 / 회원가입하기</button>
      </div>
    `;
    return;
  }

  const res = await fetch("/api/v1/modules/korean_exam/my-attempts", { headers: getAuthHeaders(false) });
  if (!res.ok) {
    container.innerHTML = `<p style="color:#b91c1c;">시험 기록을 불러오지 못했습니다.</p>`;
    return;
  }
  const attempts = await res.json();
  if (!attempts.length) {
    container.innerHTML = `<p style="color:#64748b; text-align:center; padding:20px;">아직 응시한 시험 기록이 없습니다.</p>`;
    return;
  }

  window._cachedExamAttempts = attempts;

  const seriesMap = new Map();
  attempts.forEach(att => {
    const sid = att.series_id || att.id;
    if (!seriesMap.has(sid)) {
      seriesMap.set(sid, {
        series_id: sid,
        title: att.exam_title,
        rounds: []
      });
    }
    const group = seriesMap.get(sid);
    if (att.round_no === 1) group.title = att.exam_title;
    group.rounds.push(att);
  });

  const seriesList = Array.from(seriesMap.values());
  seriesList.forEach(s => s.rounds.sort((a, b) => (a.round_no || 1) - (b.round_no || 1)));

  container.innerHTML = seriesList.map(series => {
    const firstRound = series.rounds[0];
    const latestRound = series.rounds[series.rounds.length - 1];

    return `
      <div class="word-card" style="background:#fff; border:2px solid #cbd5e1; margin-bottom:16px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-bottom:10px; border-bottom:1px solid #e2e8f0; margin-bottom:10px;">
          <div>
            <span class="tag" style="background:#1e293b; color:#fff;">총 ${series.rounds.length}회 응시</span>
            <strong style="font-size:17px; color:#0f172a; margin-left:6px;">${series.title}</strong>
            <small style="color:#64748b; margin-left:8px;">최초 응시: ${new Date(firstRound.created_at).toLocaleDateString()}</small>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            ${latestRound.wrong_count > 0 ? `
              <button type="button" style="background:#d97706; padding:5px 10px; font-size:12px;" onclick="retryExamFromAttempt('${latestRound.id}', 'RETRY_WRONG')">
                최근 오답 다시보기 (${latestRound.wrong_count}문항)
              </button>` : ""}
            <button type="button" style="background:#7c3aed; padding:5px 10px; font-size:12px;" onclick="retryExamFromAttempt('${firstRound.id}', 'RETRY_ALL')">
              전체 시험 다시보기
            </button>
            <button type="button" class="danger" style="padding:5px 10px; font-size:12px;" onclick="deleteExamSeriesRecord('${series.series_id}')">
              시리즈 전체 삭제
            </button>
          </div>
        </div>

        <table style="margin-top:4px;">
          <thead>
            <tr>
              <th style="width:80px;">회차</th>
              <th style="width:130px;">응시 유형</th>
              <th>응시 일시</th>
              <th>점수</th>
              <th>정답 / 오답</th>
              <th>소요시간</th>
              <th>관리 및 재응시</th>
            </tr>
          </thead>
          <tbody>
            ${series.rounds.map(r => {
              const modeText = getAttemptModeLabel(r.attempt_mode);
              const modeColor = r.attempt_mode === "RETRY_WRONG" ? "#fef3c7; color:#92400e" : (r.attempt_mode === "RETRY_ALL" ? "#f3e8ff; color:#6b21a8" : "#dbeafe; color:#1e40af");
              return `
                <tr>
                  <td><strong>${r.round_no || 1}회차</strong></td>
                  <td><span class="tag" style="background:${modeColor};">${modeText}</span></td>
                  <td><small>${new Date(r.created_at).toLocaleString()}</small></td>
                  <td><strong style="color:#1d4ed8;">${r.score}점</strong> <small style="color:#64748b;">(${r.earned_points}/${r.total_points})</small></td>
                  <td>
                    <span style="color:#16a34a; font-weight:700;">O: ${r.correct_count}</span> /
                    <span style="color:#dc2626; font-weight:700;">X: ${r.wrong_count}</span>
                  </td>
                  <td>${formatMMSS(r.elapsed_seconds)}</td>
                  <td>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                      <button type="button" style="padding:4px 8px; font-size:11px;" onclick="viewAttemptDetailById('${r.id}')">정오답</button>
                      ${r.wrong_count > 0 ? `
                        <button type="button" style="padding:4px 8px; font-size:11px; background:#d97706;" onclick="retryExamFromAttempt('${r.id}', 'RETRY_WRONG')">오답 재시험</button>` : ""}
                      <button type="button" style="padding:4px 8px; font-size:11px; background:#7c3aed;" onclick="retryExamFromAttempt('${r.id}', 'RETRY_ALL')">전체 재시험</button>
                      <button type="button" class="danger" style="padding:4px 8px; font-size:11px;" onclick="deleteSingleAttemptRecord('${r.id}')">삭제</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }).join("");
}

function viewAttemptDetailById(attemptId) {
  const attempt = (window._cachedExamAttempts || []).find(a => a.id === attemptId);
  if (!attempt) return;

  const detailBox = document.getElementById("ke-history-detail");
  detailBox.classList.remove("hidden");

  const roundTitle = `${attempt.round_no || 1}회차 · ${getAttemptModeLabel(attempt.attempt_mode)}`;
  detailBox.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
      <h4 style="margin:0;">[${attempt.exam_title} - ${roundTitle}] 상세 정오답 내역 (${attempt.score}점)</h4>
      <div style="display:flex; gap:6px;">
        ${attempt.wrong_count > 0 ? `
          <button type="button" style="background:#d97706; padding:5px 10px; font-size:12px;" onclick="retryExamFromAttempt('${attempt.id}', 'RETRY_WRONG')">
            이 회차 틀린 문항만 다시보기 (${attempt.wrong_count}문항)
          </button>` : ""}
        <button type="button" style="background:#7c3aed; padding:5px 10px; font-size:12px;" onclick="retryExamFromAttempt('${attempt.id}', 'RETRY_ALL')">
          이 회차 전체 다시보기
        </button>
      </div>
    </div>
    ${(attempt.detail_results || []).map(r => `
      <div class="word-card" style="background:${r.is_correct ? "#f0fdf4" : "#fef2f2"}; border-color:${r.is_correct ? "#bbf7d0" : "#fecaca"};">
        <span class="tag" style="background:${r.is_correct ? "#16a34a" : "#dc2626"}; color:#fff;">${r.display_no}번 · ${r.is_correct ? "정답" : "오답"} (${r.earned_points}/${r.max_points}점)</span>
        <strong style="margin-left:6px;">${r.prompt_text}</strong>
        <div style="font-size:13px; margin-top:6px;">
          제출: <b>${r.user_answer}</b> | 정답: <b style="color:#15803d;">${r.correct_answer}</b>
          ${r.explanation ? `<br/><small style="color:#475569;">해설: ${r.explanation}</small>` : ""}
        </div>
      </div>
    `).join("")}
  `;
  detailBox.scrollIntoView({ behavior: "smooth" });
}

async function deleteSingleAttemptRecord(attemptId) {
  if (!confirm("이 회차의 시험 기록을 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/my-attempts/${attemptId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("기록 삭제 실패", true);
  showMsg("선택한 회차 기록이 삭제되었습니다.");
  loadMyExamHistory();
}

async function deleteExamSeriesRecord(seriesId) {
  if (!confirm("이 시험과 연결된 모든 회차 기록을 한꺼번에 삭제하시겠습니까?")) return;
  const res = await fetch(`/api/v1/modules/korean_exam/my-series/${seriesId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false)
  });
  if (!res.ok) return showMsg("시리즈 삭제 실패", true);
  showMsg("연관된 전체 회차 기록이 삭제되었습니다.");
  loadMyExamHistory();
}