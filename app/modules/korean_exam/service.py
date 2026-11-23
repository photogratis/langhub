import random
import re
from typing import List, Dict, Optional
from fastapi import HTTPException
from app.core.database import supabase
from app.modules.korean_exam.schemas import (
    ExamGenerateRequest,
    ExamRetryRequest,
    ExamSubmitRequest,
)


def _norm_answer(text: str) -> str:
    cleaned = re.sub(r"[.?!~]+$", "", (text or "").strip())
    return re.sub(r"\s+", "", cleaned).lower()


def _build_exam_sections_from_questions(
    questions: List[dict],
    group_map: Dict[str, dict],
    points_override_map: Optional[Dict[str, int]] = None,
    preserve_exact_order: bool = False,
) -> list:
    """
    문항 리스트를 그룹 단위로 묶되, 같은 그룹 문항이 2개 이상 함께 출제될 때만 GROUP 섹션으로 묶고
    1문항만 단독으로 출제될 경우(예: 오답 재시험 등)에는 SINGLE 섹션으로 처리합니다.
    """
    units: List[dict] = []
    seen_groups: Dict[str, dict] = {}

    for q in questions:
        gid = q.get("group_id")
        if gid and str(gid) in group_map:
            gid_str = str(gid)
            if gid_str not in seen_groups:
                unit = {"type": "GROUP", "group": group_map[gid_str], "questions": []}
                seen_groups[gid_str] = unit
                units.append(unit)
            seen_groups[gid_str]["questions"].append(q)
        else:
            units.append({"type": "SINGLE", "group": None, "questions": [q]})

    exam_sections = []
    display_no = 1

    for unit in units:
        if not preserve_exact_order:
            unit["questions"].sort(key=lambda x: x.get("order_in_group", 1))

        grp = unit["group"]
        # 그룹 문항이 1개만 단독으로 나온 경우 SINGLE 섹션으로 전환
        is_grouped_together = bool(grp and len(unit["questions"]) >= 2)
        section_type = "GROUP" if is_grouped_together else "SINGLE"

        formatted_qs = []
        for q in unit["questions"]:
            qid_str = str(q["id"])
            choices = list(q.get("choices") or [])
            if q.get("question_type") == "MCQ" and q.get("shuffle_choices", True):
                random.shuffle(choices)

            custom_pts = (
                points_override_map.get(qid_str)
                if points_override_map and qid_str in points_override_map
                else q.get("points", 10)
            )

            # 단독 출력(SINGLE) 전환 시 그룹에만 있던 지문/미디어가 유실되지 않도록 병합
            passage_text = q.get("passage_text", "")
            image_url = q.get("image_url", "")
            audio_url = q.get("audio_url", "")
            tts_text = q.get("tts_text", "")

            if grp and not is_grouped_together:
                if grp.get("passage_text"):
                    passage_text = (
                        f"{grp['passage_text'].strip()}\n\n{passage_text.strip()}".strip()
                        if passage_text.strip()
                        else grp["passage_text"].strip()
                    )
                if not image_url and grp.get("image_url"):
                    image_url = grp["image_url"]
                if not audio_url and grp.get("audio_url"):
                    audio_url = grp["audio_url"]
                if not tts_text and grp.get("tts_text"):
                    tts_text = grp["tts_text"]

            formatted_qs.append({
                "display_no": display_no,
                "question_id": qid_str,
                "question_type": q["question_type"],
                "level": q.get("level", ""),
                "category": q.get("category", ""),
                "points": custom_pts,
                "prompt_text": q["prompt_text"],
                "passage_text": passage_text,
                "image_url": image_url,
                "audio_url": audio_url,
                "tts_text": tts_text,
                "choices": choices,
            })
            display_no += 1

        start_no = formatted_qs[0]["display_no"]
        end_no = formatted_qs[-1]["display_no"]

        exam_sections.append({
            "section_type": section_type,
            "range_label": f"{start_no}~{end_no}번" if start_no != end_no else f"{start_no}번",
            "group_info": {
                "id": str(grp["id"]),
                "title": grp["title"],
                "instruction": grp["instruction"],
                "passage_text": grp.get("passage_text", ""),
                "image_url": grp.get("image_url", ""),
                "audio_url": grp.get("audio_url", ""),
                "tts_text": grp.get("tts_text", ""),
            } if is_grouped_together else None,
            "questions": formatted_qs,
        })

    return exam_sections

def generate_exam_from_paper(paper_id: str) -> dict:
    """
    관리자/선생님이 직접 구성하여 배포한 공식 시험지(exam_papers)를 불러와 응시용 시험지 생성
    """
    p_res = supabase.table("exam_papers").select("*").eq("id", paper_id).execute()
    if not p_res.data:
        raise HTTPException(status_code=404, detail="해당 시험지를 찾을 수 없습니다.")

    paper = p_res.data[0]
    items = sorted(paper.get("items") or [], key=lambda x: x.get("order_no", 1))
    if not items:
        raise HTTPException(status_code=400, detail="시험지에 포함된 문항이 없습니다.")

    q_ids = [item["question_id"] for item in items]
    points_map = {str(item["question_id"]): int(item.get("points", 10)) for item in items}

    q_res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    q_map = {str(q["id"]): q for q in (q_res.data or [])}

    ordered_questions = [q_map[qid] for qid in q_ids if qid in q_map]
    if not ordered_questions:
        raise HTTPException(status_code=404, detail="시험지 문항들이 문제은행에서 삭제되어 응시할 수 없습니다.")

    g_res = supabase.table("exam_question_groups").select("*").execute()
    group_map = {str(g["id"]): g for g in (g_res.data or [])}

    exam_sections = _build_exam_sections_from_questions(
        ordered_questions,
        group_map,
        points_override_map=points_map,
        preserve_exact_order=True,
    )
    total_q = sum(len(s["questions"]) for s in exam_sections)

    return {
        "exam_title": paper["title"],
        "total_questions": total_q,
        "time_limit_seconds": paper.get("time_limit_seconds", 600),
        "series_id": None,
        "attempt_mode": "NEW",
        "next_round_no": 1,
        "sections": exam_sections,
    }


def generate_exam_paper(req: ExamGenerateRequest) -> dict:
    q_query = supabase.table("exam_questions").select("*")
    if req.level:
        q_query = q_query.eq("level", req.level)
    if req.category:
        q_query = q_query.eq("category", req.category)
    if req.question_type:
        q_query = q_query.eq("question_type", req.question_type)

    q_res = q_query.execute()
    all_questions = q_res.data or []

    if req.tag and req.tag.strip():
        kw = req.tag.strip().lower()
        all_questions = [
            q for q in all_questions
            if any(kw in t.lower() for t in (q.get("tags") or []))
        ]

    if not all_questions:
        raise HTTPException(status_code=404, detail="선택한 조건에 일치하는 문제가 문제은행에 없습니다.")

    g_res = supabase.table("exam_question_groups").select("*").execute()
    group_map = {str(g["id"]): g for g in (g_res.data or [])}

    standalone_pool: List[dict] = []
    grouped_pool: Dict[str, List[dict]] = {}

    for q in all_questions:
        gid = q.get("group_id")
        if gid and str(gid) in group_map:
            grouped_pool.setdefault(str(gid), []).append(q)
        else:
            standalone_pool.append(q)

    units: List[dict] = []
    for q in standalone_pool:
        units.append({"questions": [q]})

    for gid, q_list in grouped_pool.items():
        grp = group_map[gid]
        sample_n = grp.get("sample_count") or 0
        if sample_n > 0 and len(q_list) > sample_n:
            sampled = random.sample(q_list, sample_n)
        else:
            sampled = list(q_list)
        units.append({"questions": sampled})

    random.shuffle(units)

    picked_questions: List[dict] = []
    for unit in units:
        u_len = len(unit["questions"])
        if len(picked_questions) == 0 or (len(picked_questions) + u_len <= req.max_questions):
            picked_questions.extend(unit["questions"])
        if len(picked_questions) >= req.max_questions:
            break

    exam_sections = _build_exam_sections_from_questions(picked_questions, group_map)
    total_q = sum(len(s["questions"]) for s in exam_sections)

    return {
        "exam_title": req.exam_title,
        "total_questions": total_q,
        "time_limit_seconds": req.time_limit_seconds,
        "series_id": None,
        "attempt_mode": "NEW",
        "next_round_no": 1,
        "sections": exam_sections,
    }


def generate_retry_exam_paper(req: ExamRetryRequest, user: Optional[dict]) -> dict:
    att_res = supabase.table("exam_attempts").select("*").eq("id", req.attempt_id).execute()
    if not att_res.data:
        raise HTTPException(status_code=404, detail="기준이 되는 이전 시험 기록을 찾을 수 없습니다.")

    attempt = att_res.data[0]
    if user and attempt.get("user_id") and str(attempt["user_id"]) != str(user["id"]):
        raise HTTPException(status_code=403, detail="본인의 시험 기록만 다시 응시할 수 있습니다.")

    details = attempt.get("detail_results") or []
    if req.retry_mode == "RETRY_WRONG":
        target_details = [d for d in details if not d.get("is_correct")]
        if not target_details:
            raise HTTPException(status_code=400, detail="틀린 문항이 없어 오답 다시보기를 진행할 수 없습니다.")
    else:
        target_details = list(details)
        if not target_details:
            raise HTTPException(status_code=400, detail="재출제할 문항이 없습니다.")

    target_q_ids = [d["question_id"] for d in target_details]
    points_map = {str(d["question_id"]): int(d.get("max_points", 10)) for d in target_details}

    q_res = supabase.table("exam_questions").select("*").in_("id", target_q_ids).execute()
    q_map = {str(q["id"]): q for q in (q_res.data or [])}

    ordered_questions = [q_map[qid] for qid in target_q_ids if qid in q_map]
    if not ordered_questions:
        raise HTTPException(status_code=404, detail="해당 문항들이 문제은행에서 삭제되어 다시 출제할 수 없습니다.")

    g_res = supabase.table("exam_question_groups").select("*").execute()
    group_map = {str(g["id"]): g for g in (g_res.data or [])}

    exam_sections = _build_exam_sections_from_questions(
        ordered_questions,
        group_map,
        points_override_map=points_map,
    )
    total_q = sum(len(s["questions"]) for s in exam_sections)

    if req.time_limit_seconds:
        limit_sec = req.time_limit_seconds
    else:
        orig_total = max(1, attempt.get("total_questions") or total_q)
        orig_limit = attempt.get("time_limit_seconds") or 600
        per_q = max(30, round(orig_limit / orig_total))
        limit_sec = max(60, per_q * total_q)

    series_id = str(attempt.get("series_id") or attempt["id"])
    next_round = 2
    if user:
        s_res = (
            supabase.table("exam_attempts")
            .select("round_no")
            .eq("user_id", str(user["id"]))
            .eq("series_id", series_id)
            .execute()
        )
        if s_res.data:
            next_round = max(r.get("round_no", 1) for r in s_res.data) + 1

    base_title = re.sub(r"\s*\[\d+회차.*\]$", "", attempt.get("exam_title", "한국어 모의고사")).strip()

    return {
        "exam_title": base_title,
        "total_questions": total_q,
        "time_limit_seconds": limit_sec,
        "series_id": series_id,
        "attempt_mode": req.retry_mode,
        "next_round_no": next_round,
        "sections": exam_sections,
    }


def grade_and_save_exam(req: ExamSubmitRequest, user: Optional[dict]) -> dict:
    q_ids = [ans.question_id for ans in req.answers]
    if not q_ids:
        raise HTTPException(status_code=400, detail="제출된 답안이 없습니다.")

    res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    db_q_map = {str(q["id"]): q for q in (res.data or [])}

    correct_count = 0
    earned_points = 0
    total_points = 0
    detail_results = []

    for ans in sorted(req.answers, key=lambda x: x.display_no):
        q_db = db_q_map.get(ans.question_id)
        if not q_db:
            continue

        # 시험지 제작 시 지정한 커스텀 배점(ans.points)이 있으면 우선 사용
        pts = ans.points if (ans.points is not None and ans.points > 0) else q_db.get("points", 10)
        total_points += pts
        q_type = q_db.get("question_type", "MCQ")
        is_correct = False
        user_display = "(미응답)"
        correct_display = ""

        if q_type == "MCQ":
            choices_map = {c["id"]: c for c in (q_db.get("choices") or [])}
            correct_cid = q_db.get("correct_choice_id", "")
            correct_c = choices_map.get(correct_cid, {})
            correct_display = correct_c.get("text") or ("(이미지/음성 보기)" if (correct_c.get("image_url") or correct_c.get("audio_url")) else correct_cid)

            if ans.selected_choice_id:
                picked_c = choices_map.get(ans.selected_choice_id, {})
                user_display = picked_c.get("text") or ("(이미지/음성 보기)" if (picked_c.get("image_url") or picked_c.get("audio_url")) else ans.selected_choice_id)
                if ans.selected_choice_id == correct_cid:
                    is_correct = True
        else:
            valid_answers = q_db.get("correct_answers") or []
            correct_display = " / ".join(valid_answers)
            raw_user = (ans.short_answer_text or "").strip()
            if raw_user:
                user_display = raw_user
                norm_u = _norm_answer(raw_user)
                if any(_norm_answer(v) == norm_u for v in valid_answers):
                    is_correct = True

        if is_correct:
            correct_count += 1
            earned_points += pts

        detail_results.append({
            "display_no": ans.display_no,
            "question_id": ans.question_id,
            "question_type": q_type,
            "level": q_db.get("level", ""),
            "category": q_db.get("category", ""),
            "prompt_text": q_db.get("prompt_text", ""),
            "is_correct": is_correct,
            "earned_points": pts if is_correct else 0,
            "max_points": pts,
            "user_answer": user_display,
            "correct_answer": correct_display,
            "explanation": q_db.get("explanation", ""),
        })

    total_questions = len(detail_results)
    wrong_count = total_questions - correct_count
    score = round((earned_points / total_points) * 100) if total_points > 0 else 0

    round_no = 1
    if user and req.series_id:
        s_res = (
            supabase.table("exam_attempts")
            .select("round_no")
            .eq("user_id", str(user["id"]))
            .eq("series_id", req.series_id)
            .execute()
        )
        if s_res.data:
            round_no = max(r.get("round_no", 1) for r in s_res.data) + 1

    record_payload = {
        "user_id": str(user["id"]) if user else None,
        "exam_title": req.exam_title,
        "series_id": req.series_id,
        "round_no": round_no,
        "attempt_mode": req.attempt_mode or "NEW",
        "time_limit_seconds": req.time_limit_seconds,
        "total_questions": total_questions,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "earned_points": earned_points,
        "total_points": total_points,
        "score": score,
        "elapsed_seconds": req.elapsed_seconds,
        "detail_results": detail_results,
    }

    saved_id = None
    saved_series_id = req.series_id
    if user:
        try:
            ins_res = supabase.table("exam_attempts").insert(record_payload).execute()
            if ins_res.data:
                saved_row = ins_res.data[0]
                saved_id = str(saved_row["id"])
                if not saved_series_id:
                    saved_series_id = saved_id
                    supabase.table("exam_attempts").update({"series_id": saved_series_id}).eq("id", saved_id).execute()
        except Exception:
            pass

    return {
        "attempt_id": saved_id,
        "series_id": saved_series_id,
        "is_saved": bool(saved_id),
        **record_payload,
    }