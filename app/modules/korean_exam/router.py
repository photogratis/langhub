import os
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from app.core.supabase_client import supabase
from app.core.security import get_current_user
from app.core.module_guard import require_module_access
from app.modules.korean_exam.schemas import (
    QuestionGroupCreate,
    ExamQuestionCreate,
    ExamPaperCreate,
    ExamGenerateRequest,
    ExamRetryRequest,
    ExamSubmitRequest,
    ClaimGuestAttemptRequest,
)
from app.modules.korean_exam.service import (
    generate_exam_paper,
    generate_retry_exam_paper,
    grade_and_save_exam,
)

router = APIRouter()

UPLOAD_DIR = "app/static/uploads/korean_exam"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def require_teacher_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    grade = str(current_user.get("grade") or current_user.get("role") or "").upper()
    if grade not in ("ADMIN", "TEACHER"):
        raise HTTPException(status_code=403, detail="선생님(TEACHER) 또는 관리자(ADMIN) 권한이 필요합니다.")
    return current_user


# =========================================================
# 1. 미디어 파일 업로드 (이미지 / 오디오)
# =========================================================
@router.post("/upload-media")
async def upload_exam_media(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_teacher_or_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".wav", ".ogg", ".m4a"):
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {"url": f"/static/uploads/korean_exam/{filename}", "filename": filename}


# =========================================================
# 2. 지문 그룹 관리 (CRUD)
# =========================================================
@router.get("/groups")
def list_question_groups(
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    res = supabase.table("exam_question_groups").select("*").order("created_at", desc=True).execute()
    return {"groups": res.data or []}


@router.post("/groups")
def create_question_group(
    req: QuestionGroupCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    payload["created_by"] = str(current_user["id"])
    res = supabase.table("exam_question_groups").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="지문 그룹 생성에 실패했습니다.")
    return {"group": res.data[0]}


@router.delete("/groups/{group_id}")
def delete_question_group(
    group_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    supabase.table("exam_question_groups").delete().eq("id", group_id).execute()
    return {"message": "지문 그룹이 삭제되었습니다."}


# =========================================================
# 3. 문제은행 문항 관리 (CRUD + 검색/필터)
# =========================================================
@router.get("/questions")
def list_exam_questions(
    level: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    group_id: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_teacher_or_admin),
):
    query = supabase.table("exam_questions").select("*", count="exact")
    if level:
        query = query.eq("level", level)
    if category:
        query = query.eq("category", category)
    if question_type:
        query = query.eq("question_type", question_type)
    if group_id:
        query = query.eq("group_id", group_id)
    if keyword:
        query = query.ilike("prompt_text", f"%{keyword}%")

    res = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return {
        "questions": res.data or [],
        "total": res.count if res.count is not None else len(res.data or []),
    }


@router.post("/questions")
def create_exam_question(
    req: ExamQuestionCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    if not payload.get("group_id"):
        payload["group_id"] = None
    payload["created_by"] = str(current_user["id"])
    res = supabase.table("exam_questions").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="문항 등록에 실패했습니다.")
    return {"question": res.data[0]}


@router.delete("/questions/{question_id}")
def delete_exam_question(
    question_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    supabase.table("exam_questions").delete().eq("id", question_id).execute()
    return {"message": "문항이 삭제되었습니다."}


# =========================================================
# 4. 출제된 시험지 관리 및 공유 링크 정보
# =========================================================
@router.get("/papers")
def list_exam_papers(
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    query = supabase.table("exam_papers").select("*").order("created_at", desc=True)
    grade = str((user or {}).get("grade") or (user or {}).get("role") or "").upper()
    if grade not in ("ADMIN", "TEACHER"):
        query = query.eq("is_published", True)
    res = query.execute()
    return {"papers": res.data or []}


@router.get("/papers/{paper_id}/info")
def get_public_exam_paper_info(paper_id: str):
    res = supabase.table("exam_papers").select("*").eq("id", paper_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="해당 시험지를 찾을 수 없습니다.")
    p = res.data[0]
    if not p.get("is_published", True):
        raise HTTPException(status_code=403, detail="현재 비공개 상태인 시험지입니다.")
    return {
        "id": str(p["id"]),
        "title": p["title"],
        "description": p.get("description", ""),
        "level": p.get("level", "혼합"),
        "category": p.get("category", "종합"),
        "time_limit_seconds": p.get("time_limit_seconds", 600),
        "total_points": p.get("total_points", 100),
        "question_count": len(p.get("items") or []),
        "creator_name": p.get("creator_name", "선생님"),
    }


@router.post("/papers")
def create_exam_paper(
    req: ExamPaperCreate,
    current_user: dict = Depends(require_teacher_or_admin),
):
    total_points = sum(item.points for item in req.items)
    payload = {
        "title": req.title,
        "description": req.description,
        "level": req.level,
        "category": req.category,
        "time_limit_seconds": req.time_limit_seconds,
        "is_published": req.is_published,
        "total_points": total_points,
        "items": [item.model_dump() for item in req.items],
        "created_by": str(current_user["id"]),
        "creator_name": current_user.get("username") or current_user.get("email") or "선생님",
    }
    res = supabase.table("exam_papers").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="시험지 저장에 실패했습니다.")
    return {"paper": res.data[0]}


@router.delete("/papers/{paper_id}")
def delete_exam_paper(
    paper_id: str,
    current_user: dict = Depends(require_teacher_or_admin),
):
    supabase.table("exam_papers").delete().eq("id", paper_id).execute()
    return {"message": "시험지가 삭제되었습니다."}


@router.post("/papers/{paper_id}/start")
def start_published_exam_paper(
    paper_id: str,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    res = supabase.table("exam_papers").select("*").eq("id", paper_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")
    paper = res.data[0]
    if not paper.get("is_published", True):
        raise HTTPException(status_code=403, detail="비공개 상태인 시험지입니다.")

    items = sorted(paper.get("items") or [], key=lambda x: x.get("order_no", 1))
    q_ids = [it["question_id"] for it in items]
    if not q_ids:
        raise HTTPException(status_code=400, detail="시험지에 포함된 문항이 없습니다.")

    q_res = supabase.table("exam_questions").select("*").in_("id", q_ids).execute()
    q_map = {str(q["id"]): q for q in (q_res.data or [])}

    g_ids = list({str(q["group_id"]) for q in q_map.values() if q.get("group_id")})
    g_map = {}
    if g_ids:
        g_res = supabase.table("exam_question_groups").select("*").in_("id", g_ids).execute()
        g_map = {str(g["id"]): g for g in (g_res.data or [])}

    assembled = []
    for idx, it in enumerate(items, start=1):
        qid = str(it["question_id"])
        q = q_map.get(qid)
        if not q:
            continue
        grp = g_map.get(str(q["group_id"])) if q.get("group_id") else None
        choices = [
            {
                "id": c.get("id"),
                "text": c.get("text", ""),
                "image_url": c.get("image_url", ""),
                "audio_url": c.get("audio_url", ""),
                "tts_text": c.get("tts_text", ""),
            }
            for c in (q.get("choices") or [])
        ]
        assembled.append({
            "display_no": idx,
            "question_id": qid,
            "group_id": str(q["group_id"]) if q.get("group_id") else None,
            "group_title": grp["title"] if grp else "",
            "group_instruction": grp["instruction"] if grp else "",
            "group_passage_text": grp.get("passage_text", "") if grp else "",
            "group_image_url": grp.get("image_url", "") if grp else "",
            "group_audio_url": grp.get("audio_url", "") if grp else "",
            "group_tts_text": grp.get("tts_text", "") if grp else "",
            "question_type": q.get("question_type", "MCQ"),
            "level": q.get("level", "초급"),
            "category": q.get("category", "읽기"),
            "points": it.get("points", q.get("points", 10)),
            "prompt_text": q.get("prompt_text", ""),
            "passage_text": q.get("passage_text", ""),
            "image_url": q.get("image_url", ""),
            "audio_url": q.get("audio_url", ""),
            "tts_text": q.get("tts_text", ""),
            "choices": choices,
        })

    return {
        "exam_title": paper["title"],
        "time_limit_seconds": paper.get("time_limit_seconds", 600),
        "total_questions": len(assembled),
        "total_points": sum(x["points"] for x in assembled),
        "questions": assembled,
    }


# =========================================================
# 5. 시험 출제 / 재시험 / 채점 / 비회원 기록 이관
# =========================================================
@router.post("/generate")
def generate_exam(
    req: ExamGenerateRequest,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    return generate_exam_paper(req)


@router.post("/retry")
def retry_exam(
    req: ExamRetryRequest,
    current_user: dict = Depends(get_current_user),
):
    return generate_retry_exam_paper(req, str(current_user["id"]))


@router.post("/submit")
def submit_exam(
    req: ExamSubmitRequest,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    user_id = str(user["id"]) if user and user.get("id") else None
    return grade_and_save_exam(req, user_id)


@router.post("/claim-guest-attempt")
def claim_guest_exam_attempt(
    req: ClaimGuestAttemptRequest,
    current_user: dict = Depends(get_current_user),
):
    payload = {
        "user_id": str(current_user["id"]),
        "exam_title": req.exam_title,
        "series_id": None,
        "round_no": 1,
        "attempt_mode": "NEW",
        "time_limit_seconds": req.time_limit_seconds,
        "total_questions": req.total_questions,
        "correct_count": req.correct_count,
        "wrong_count": req.wrong_count,
        "earned_points": req.earned_points,
        "total_points": req.total_points,
        "score": req.score,
        "elapsed_seconds": req.elapsed_seconds,
        "detail_results": req.detail_results,
    }
    ins_res = supabase.table("exam_attempts").insert(payload).execute()
    if not ins_res.data:
        raise HTTPException(status_code=500, detail="시험 기록 이관 저장에 실패했습니다.")

    saved = ins_res.data[0]
    saved_id = str(saved["id"])
    supabase.table("exam_attempts").update({"series_id": saved_id}).eq("id", saved_id).execute()

    return {
        "attempt_id": saved_id,
        "series_id": saved_id,
        "message": "비회원 상태로 응시한 시험 결과가 회원 계정에 1회차 기록으로 안전하게 저장되었습니다.",
    }


# =========================================================
# 6. 응시 이력 조회 및 삭제
# =========================================================
@router.get("/attempts")
def list_my_exam_attempts(
    current_user: dict = Depends(get_current_user),
):
    res = (
        supabase.table("exam_attempts")
        .select("*")
        .eq("user_id", str(current_user["id"]))
        .order("created_at", desc=True)
        .execute()
    )
    return {"attempts": res.data or []}


@router.delete("/attempts/{attempt_id}")
def delete_single_attempt(
    attempt_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase.table("exam_attempts").delete().eq("id", attempt_id).eq("user_id", str(current_user["id"])).execute()
    return {"message": "시험 기록이 삭제되었습니다."}


@router.delete("/attempts/series/{series_id}")
def delete_series_attempts(
    series_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase.table("exam_attempts").delete().eq("series_id", series_id).eq("user_id", str(current_user["id"])).execute()
    return {"message": "해당 시험의 전체 회차 기록이 삭제되었습니다."}