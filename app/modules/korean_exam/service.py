import random
import uuid
import re
from typing import Optional, List, Dict, Any
from fastapi import HTTPException
from app.core.database import supabase
from app.modules.korean_exam.schemas import (
    ExamGenerateRequest,
    ExamRetryRequest,
    ExamSubmitRequest,
)


def _normalize_text(val: str) -> str:
    return re.sub(r"\s+", "", (val or "").strip()).lower()


def _format_question_for_exam(q: Dict[str, Any], display_no: int, custom_points: Optional[int] = None) -> Dict[str, Any]:
    choices = list(q.get("choices") or [])
    if q.get("question_type") == "MCQ" and q.get("shuffle_choices", True):
        random.shuffle(choices)

    return {
        "display_no": display_no,
        "question_id": str(q["id"]),
        "group_id": str(q["group_id"]) if q.get("group_id") else None,
        "question_type": q.get("question_type", "MCQ"),
        "level": q.get("level", "초급"),
        "category": q.get("category", "읽기"),
        "points": custom_points if custom_points is not None else q.get("points", 10),
        "prompt_text": q.get("prompt_text", ""),
        "passage_text": q.get("passage_text", ""),
        "image_url": q.get("image_url", ""),
        "audio_url": q.get("audio_url", ""),
        "tts_text": q.get("tts_text", ""),
        "choices": choices,
    }


def _build_sections_from_questions(questions: List[Dict[str, Any]], points_map: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
    group_ids = list({str(q["group_id"]) for q in questions if q.get("group_id")})
    groups_by_id: Dict[str, Dict[str, Any]] = {}
    if group_ids:
        g_res = supabase.table("exam_question_groups").select("*").in_("id", group_ids).execute()
        for g in (g_res.data or []):
            groups_by_id[str(g["id"])] = g

    sections: List[Dict[str, Any]] = []
    display_no = 1
    idx = 0
    while idx < len(questions):
        q = questions[idx]
        gid = str(q["group_id"]) if q.get("group_id") else None
        if gid and gid in groups_by_id:
            group_qs = []
            while idx < len(questions) and str(questions[idx].get("group_id") or "") == gid:
                cur_q = questions[idx]
                c_pts = points_map.get(str(cur_q["id"])) if points_map else None
                group_qs.append(_format_question_for_exam(cur_q, display_no, c_pts))
                display_no += 1
                idx += 1
            sections.append({
                "group_info": groups_by_id[gid],
                "questions": group_qs,
            })
        else:
            c_pts = points_map.get(str(q["id"])) if points_map else None
            sections.append({
                "group_info": None,
                "questions": [_format_question_for_exam(q, display_no, c_pts)],
            })
            display_no += 1
            idx += 1
    return sections


def generate_exam_paper(req: ExamGenerateRequest) -> Dict[str, Any]:
    query = supabase.table("exam_questions").select("*")
    if req.level:
        query = query.eq("level", req.level)
    if req.category:
        query = query.eq("category", req.category)
    if req.question_type:
        query = query.eq("question_type", req.question_type)

    res = query.execute()
    pool = res.data or []

    if req.tag and req.tag.strip():
        target = req.tag.strip().lower()
        pool = [q for q in pool if any(target in t.lower() for t in (q.get("tags") or []))]

    if not pool:
        raise HTTPException(status_code=404, detail="조건에 맞는 문제가 문제은행에 없습니다. 먼저 문항을 등록해 주세요.")

    # 그룹별 샘플링 처리
    by_group: Dict[str, List[Dict[str, Any]]] = {}
    standalone: List[Dict[str, Any]] = []
    for q in pool:
        if q.get("group_id"):
            by_group.setdefault(str(q["group_id"]), []).append(q)
        else:
            standalone.append(q)

    selected: List[Dict[str, Any]] = []
    if by_group:
        g_res = supabase.table("exam_question_groups").select("id, sample_count").in_("id", list(by_group.keys())).execute()
        sample_map = {str(g["id"]): g.get("sample_count", 0) for g in (g_res.data or [])}
        for gid, g_qs in by_group.items():
            g_qs.sort(key=lambda x: x.get("order_in_group", 1))
            sc = sample_map.get(gid, 0)
            if sc and 0 < sc < len(g_qs):
                picked = random.sample(g_qs, sc)
                picked.sort(key=lambda x: x.get("order_in_group", 1))
                selected.extend(picked)
            else:
                selected.extend(g_qs)

    random.shuffle(standalone)
    selected.extend(standalone)
    selected = selected[: req.max_questions]

    sections = _build_sections_from_questions(selected)
    total_q = sum(len(s["questions"]) for s in sections)
    total_pts = sum(q["points"] for s in sections for q in s["questions"])

    return {
        "exam_title": req.exam_title,
        "time_limit_seconds": req.time_limit_seconds,
        "total_questions": total_q,
        "total_points": total_pts,
        "series_id": None,
        "round_no": 1,
        "attempt_mode": "NEW",
        "sections": sections,
    }


def generate_exam_from_paper(paper_id: str) -> Dict[str, Any]:
    p_res = supabase.table("exam_papers").select("*").eq("id", paper_id).execute()
    if not p_res.data:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")
    paper = p_res.data[0]
    items = sorted(paper.get("items") or [], key=lambda x: x.get("order_no", 1))
    if not items:
        raise HTTPException(status_code=400, detail="시험지에 포함된 문항이 없습니다.")

    q_ids = [str(it["question_id"]) for it in items]
    points_map = {str(it["question_id"]): int(it.get("points", 10)) for it in items}

    q_res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    q_by_id = {str(q["id"]): q for q in (q_res.data or [])}

    ordered_qs = [q_by_id[qid] for qid in q_ids if qid in q_by_id]
    if not ordered_qs:
        raise HTTPException(status_code=404, detail="시험지에 연결된 문항 데이터를 찾을 수 없습니다.")

    sections = _build_sections_from_questions(ordered_qs, points_map)
    total_q = sum(len(s["questions"]) for s in sections)
    total_pts = sum(q["points"] for s in sections for q in s["questions"])

    return {
        "paper_id": str(paper["id"]),
        "exam_title": paper["title"],
        "time_limit_seconds": paper.get("time_limit_seconds", 600),
        "total_questions": total_q,
        "total_points": total_pts,
        "series_id": None,
        "round_no": 1,
        "attempt_mode": "NEW",
        "sections": sections,
    }


def generate_retry_exam_paper(req: ExamRetryRequest, user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    att_res = supabase.table("exam_attempts").select("*").eq("id", req.attempt_id).execute()
    if not att_res.data:
        raise HTTPException(status_code=404, detail="이전 시험 기록을 찾을 수 없습니다.")
    att = att_res.data[0]

    details = att.get("detail_results") or []
    if req.retry_mode == "RETRY_WRONG":
        target_details = [d for d in details if not d.get("is_correct")]
    else:
        target_details = details

    if not target_details:
        raise HTTPException(status_code=400, detail="다시 풀 문항이 없습니다.")

    q_ids = [str(d["question_id"]) for d in target_details]
    points_map = {str(d["question_id"]): int(d.get("max_points", 10)) for d in target_details}

    q_res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    q_by_id = {str(q["id"]): q for q in (q_res.data or [])}
    ordered_qs = [q_by_id[qid] for qid in q_ids if qid in q_by_id]

    if not ordered_qs:
        raise HTTPException(status_code=404, detail="원본 문항이 문제은행에서 삭제되어 재시험을 생성할 수 없습니다.")

    series_id = str(att.get("series_id") or att["id"])
    next_round = int(att.get("round_no") or 1) + 1
    if user:
        r_res = (
            supabase.table("exam_attempts")
            .select("round_no")
            .eq("series_id", series_id)
            .eq("user_id", str(user["id"]))
            .order("round_no", desc=True)
            .limit(1)
            .execute()
        )
        if r_res.data:
            next_round = int(r_res.data[0].get("round_no", 1)) + 1

    sections = _build_sections_from_questions(ordered_qs, points_map)
    total_q = sum(len(s["questions"]) for s in sections)
    total_pts = sum(q["points"] for s in sections for q in s["questions"])
    time_limit = req.time_limit_seconds or max(60, total_q * 60)

    return {
        "exam_title": att.get("exam_title", "재시험"),
        "time_limit_seconds": time_limit,
        "total_questions": total_q,
        "total_points": total_pts,
        "series_id": series_id,
        "round_no": next_round,
        "attempt_mode": req.retry_mode,
        "sections": sections,
    }


def grade_and_save_exam(req: ExamSubmitRequest, user: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not req.answers:
        raise HTTPException(status_code=400, detail="제출된 답안이 없습니다.")

    q_ids = list({str(a.question_id) for a in req.answers})
    q_res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    q_by_id = {str(q["id"]): q for q in (q_res.data or [])}

    detail_results = []
    correct_count = 0
    wrong_count = 0
    earned_points = 0
    total_points = 0

    for ans in sorted(req.answers, key=lambda x: x.display_no):
        q = q_by_id.get(str(ans.question_id))
        if not q:
            continue

        max_pts = ans.points if ans.points is not None else int(q.get("points", 10))
        total_points += max_pts
        q_type = q.get("question_type", "MCQ")
        is_correct = False
        user_answer_display = "(미응답)"
        correct_answer_display = ""

        if q_type == "MCQ":
            choices = q.get("choices") or []
            choice_map = {str(c.get("id")): (c.get("text") or f"보기({c.get('id')})") for c in choices}
            correct_cid = str(q.get("correct_choice_id") or "")
            correct_answer_display = choice_map.get(correct_cid, correct_cid)

            if ans.selected_choice_id:
                sel_cid = str(ans.selected_choice_id)
                user_answer_display = choice_map.get(sel_cid, sel_cid)
                is_correct = (sel_cid == correct_cid)
        else:
            valid_answers = [a.strip() for a in (q.get("correct_answers") or []) if a.strip()]
            correct_answer_display = " / ".join(valid_answers)
            raw_user = (ans.short_answer_text or "").strip()
            if raw_user:
                user_answer_display = raw_user
                norm_user = _normalize_text(raw_user)
                is_correct = any(_normalize_text(va) == norm_user for va in valid_answers)

        pts = max_pts if is_correct else 0
        if is_correct:
            correct_count += 1
            earned_points += pts
        else:
            wrong_count += 1

        detail_results.append({
            "display_no": ans.display_no,
            "question_id": str(ans.question_id),
            "prompt_text": q.get("prompt_text", ""),
            "is_correct": is_correct,
            "earned_points": pts,
            "max_points": max_pts,
            "user_answer": user_answer_display,
            "correct_answer": correct_answer_display,
            "explanation": q.get("explanation", ""),
        })

    total_q = len(detail_results)
    score = round((earned_points / total_points) * 100) if total_points > 0 else 0

    attempt_id = str(uuid.uuid4())
    series_id = str(req.series_id) if req.series_id else attempt_id
    round_no = 1
    saved_to_history = False

    if user and user.get("id"):
        if req.series_id:
            r_res = (
                supabase.table("exam_attempts")
                .select("round_no")
                .eq("series_id", series_id)
                .eq("user_id", str(user["id"]))
                .order("round_no", desc=True)
                .limit(1)
                .execute()
            )
            if r_res.data:
                round_no = int(r_res.data[0].get("round_no", 1)) + 1

        insert_payload = {
            "id": attempt_id,
            "user_id": str(user["id"]),
            "series_id": series_id,
            "round_no": round_no,
            "attempt_mode": req.attempt_mode or "NEW",
            "exam_title": req.exam_title,
            "total_questions": total_q,
            "correct_count": correct_count,
            "wrong_count": wrong_count,
            "earned_points": earned_points,
            "total_points": total_points,
            "score": score,
            "elapsed_seconds": req.elapsed_seconds,
            "time_limit_seconds": req.time_limit_seconds,
            "detail_results": detail_results,
        }
        supabase.table("exam_attempts").insert(insert_payload).execute()
        saved_to_history = True

    return {
        "attempt_id": attempt_id,
        "series_id": series_id,
        "round_no": round_no,
        "attempt_mode": req.attempt_mode or "NEW",
        "saved_to_history": saved_to_history,
        "exam_title": req.exam_title,
        "total_questions": total_q,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "earned_points": earned_points,
        "total_points": total_points,
        "score": score,
        "elapsed_seconds": req.elapsed_seconds,
        "detail_results": detail_results,
    }