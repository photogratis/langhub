import uuid
import os
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.auth.dependencies import get_current_user
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
    generate_exam_from_paper,
    generate_retry_exam_paper,
    grade_and_save_exam,
)

router = APIRouter()


def require_teacher_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("grade") not in ("ADMIN", "TEACHER"):
        raise HTTPException(
            status_code=403,
            detail="선생님(TEACHER) 또는 관리자(ADMIN) 등급만 접근할 수 있습니다.",
        )
    return current_user


@router.post("/upload-media")
async def upload_exam_media(
    file: UploadFile = File(...),
    staff: dict = Depends(require_teacher_or_admin),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    allowed_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp3", ".wav", ".ogg", ".m4a"}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {ext}")

    content = await file.read()
    storage_path = f"uploads/{uuid.uuid4().hex}{ext}"

    try:
        supabase.storage.from_("exam-media").upload(
            path=storage_path,
            file=content,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )
        public_url = supabase.storage.from_("exam-media").get_public_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"미디어 업로드 실패: {str(e)}")

    return {"url": public_url, "filename": file.filename}


# 1. 문제 그룹 CRUD
@router.get("/groups")
def list_question_groups(
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    res = supabase.table("exam_question_groups").select("*").order("created_at", desc=True).execute()
    return res.data or []


@router.post("/groups")
def create_question_group(
    req: QuestionGroupCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    payload["tags"] = [t.strip() for t in req.tags if t.strip()]
    res = supabase.table("exam_question_groups").insert(payload).execute()
    return res.data[0]


@router.put("/groups/{group_id}")
def update_question_group(
    group_id: str,
    req: QuestionGroupCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    payload["tags"] = [t.strip() for t in req.tags if t.strip()]
    res = supabase.table("exam_question_groups").update(payload).eq("id", group_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/groups/{group_id}")
def delete_question_group(group_id: str, staff: dict = Depends(require_teacher_or_admin)):
    supabase.table("exam_question_groups").delete().eq("id", group_id).execute()
    return {"message": "그룹과 소속 문항이 삭제되었습니다."}


# 2. 문제은행 문항 조회 (검색 + 다중 필터 + 페이지네이션)
@router.get("/questions")
def list_bank_questions(
    level: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    group_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=200),
    staff: dict = Depends(require_teacher_or_admin),
):
    query = (
        supabase.table("exam_questions")
        .select("*, exam_question_groups(id, title, level, category)", count="exact")
        .order("created_at", desc=True)
    )
    if level:
        query = query.eq("level", level)
    if category:
        query = query.eq("category", category)
    if question_type:
        query = query.eq("question_type", question_type)
    if group_id:
        query = query.eq("group_id", group_id)
    if q and q.strip():
        kw = q.strip()
        query = query.or_(f"prompt_text.ilike.%{kw}%,passage_text.ilike.%{kw}%")

    has_tag = bool(tag and tag.strip())
    if not has_tag:
        start = (page - 1) * page_size
        end = start + page_size - 1
        res = query.range(start, end).execute()
        items = res.data or []
        total = res.count if res.count is not None else len(items)
    else:
        res = query.execute()
        all_items = res.data or []
        target_tag = tag.strip().lower()
        filtered = [
            item for item in all_items
            if any(target_tag in t.lower() for t in (item.get("tags") or []))
        ]
        total = len(filtered)
        start = (page - 1) * page_size
        items = filtered[start : start + page_size]

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/questions")
def create_bank_question(
    req: ExamQuestionCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    payload["group_id"] = req.group_id if req.group_id else None
    payload["choices"] = [c.model_dump() for c in req.choices]
    payload["correct_answers"] = [a.strip() for a in req.correct_answers if a.strip()]
    payload["tags"] = [t.strip() for t in req.tags if t.strip()]

    res = supabase.table("exam_questions").insert(payload).execute()
    return res.data[0]


@router.put("/questions/{question_id}")
def update_bank_question(
    question_id: str,
    req: ExamQuestionCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    payload = req.model_dump()
    payload["group_id"] = req.group_id if req.group_id else None
    payload["choices"] = [c.model_dump() for c in req.choices]
    payload["correct_answers"] = [a.strip() for a in req.correct_answers if a.strip()]
    payload["tags"] = [t.strip() for t in req.tags if t.strip()]

    res = supabase.table("exam_questions").update(payload).eq("id", question_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="문항을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/questions/{question_id}")
def delete_bank_question(question_id: str, staff: dict = Depends(require_teacher_or_admin)):
    supabase.table("exam_questions").delete().eq("id", question_id).execute()
    return {"message": "문항이 삭제되었습니다."}


# 3. 선생님/관리자 제작 시험지(exam_papers) CRUD 및 공유 링크 조회
@router.get("/papers")
def list_exam_papers(
    include_unpublished: bool = Query(False),
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    query = supabase.table("exam_papers").select("*").order("created_at", desc=True)
    is_staff = bool(user and user.get("grade") in ("ADMIN", "TEACHER"))
    if not (include_unpublished and is_staff):
        query = query.eq("is_published", True)
    res = query.execute()
    return res.data or []


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
    staff: dict = Depends(require_teacher_or_admin),
):
    items_data = [item.model_dump() for item in req.items]
    total_points = sum(item["points"] for item in items_data)

    payload = {
        "title": req.title.strip(),
        "description": req.description.strip(),
        "level": req.level,
        "category": req.category,
        "time_limit_seconds": req.time_limit_seconds,
        "total_points": total_points,
        "items": items_data,
        "is_published": req.is_published,
        "created_by": str(staff["id"]),
        "creator_name": staff.get("nickname") or staff.get("username") or "선생님",
    }
    res = supabase.table("exam_papers").insert(payload).execute()
    return res.data[0]


@router.put("/papers/{paper_id}")
def update_exam_paper(
    paper_id: str,
    req: ExamPaperCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    items_data = [item.model_dump() for item in req.items]
    total_points = sum(item["points"] for item in items_data)

    payload = {
        "title": req.title.strip(),
        "description": req.description.strip(),
        "level": req.level,
        "category": req.category,
        "time_limit_seconds": req.time_limit_seconds,
        "total_points": total_points,
        "items": items_data,
        "is_published": req.is_published,
    }
    res = supabase.table("exam_papers").update(payload).eq("id", paper_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="시험지를 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/papers/{paper_id}")
def delete_exam_paper(paper_id: str, staff: dict = Depends(require_teacher_or_admin)):
    supabase.table("exam_papers").delete().eq("id", paper_id).execute()
    return {"message": "시험지가 삭제되었습니다."}


@router.post("/papers/{paper_id}/start")
def start_published_exam_paper(
    paper_id: str,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    return generate_exam_from_paper(paper_id)


# 4. 랜덤 시험지 추출 / 다시보기 시험지 추출 / 채점 / 비회원 기록 이관
@router.post("/generate")
def api_generate_exam(
    req: ExamGenerateRequest,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    return generate_exam_paper(req)


@router.post("/retry")
def api_retry_exam(
    req: ExamRetryRequest,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    return generate_retry_exam_paper(req, user)


@router.post("/submit")
def api_submit_exam(
    req: ExamSubmitRequest,
    user: Optional[dict] = Depends(require_module_access("korean_exam")),
):
    return grade_and_save_exam(req, user)


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


# 5. 내 시험 응시 이력 조회 및 삭제
@router.get("/my-attempts")
def get_my_exam_attempts(current_user: dict = Depends(get_current_user)):
    res = (
        supabase.table("exam_attempts")
        .select("*")
        .eq("user_id", str(current_user["id"]))
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


@router.delete("/my-attempts/{attempt_id}")
def delete_single_exam_attempt(
    attempt_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase.table("exam_attempts").delete().eq("id", attempt_id).eq("user_id", str(current_user["id"])).execute()
    return {"message": "해당 회차 시험 기록이 삭제되었습니다."}


@router.delete("/my-series/{series_id}")
def delete_exam_series(
    series_id: str,
    current_user: dict = Depends(get_current_user),
):
    supabase.table("exam_attempts").delete().eq("series_id", series_id).eq("user_id", str(current_user["id"])).execute()
    return {"message": "연관된 모든 회차의 시험 기록이 삭제되었습니다."}