import os
import uuid
from typing import Optional
from urllib.parse import unquote
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.auth.dependencies import get_current_user, get_optional_user
from app.modules.korean_reading.schemas import (
    ReadingPassageCreate,
    ReadingPassageUpdate,
    ReadingVisibilityUpdate,
)
from app.modules.korean_reading.service import evaluate_reading_accuracy, compute_passage_stats

router = APIRouter()


def require_teacher_or_admin(current_user: dict = Depends(get_current_user)) -> dict:
    grade = str(current_user.get("grade") or "").strip().upper()
    if grade not in ("ADMIN", "TEACHER"):
        raise HTTPException(status_code=403, detail="관리자(ADMIN) 또는 선생님(TEACHER) 권한이 필요합니다.")
    return current_user


# 1. 지문 목록 조회 (누구나 조회 가능)
@router.get("/passages")
def list_reading_passages(
    level: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user: Optional[dict] = Depends(require_module_access("korean_reading")),
):
    query = supabase.table("reading_passages").select("*").order("created_at", desc=True)
    if level:
        query = query.eq("level", level)
    if tag and tag.strip():
        query = query.contains("tags", [tag.strip()])
    if q and q.strip():
        query = query.ilike("title", f"%{q.strip()}%")

    res = query.execute()
    return res.data or []


# 2. 지문 등록 (관리자 및 선생님 전용)
@router.post("/passages")
def create_reading_passage(
    req: ReadingPassageCreate,
    staff: dict = Depends(require_teacher_or_admin),
):
    char_count, word_count = compute_passage_stats(req.content)
    tags = [t.strip() for t in req.tags if t.strip()]

    payload = {
        "title": req.title.strip(),
        "content": req.content.strip(),
        "level": req.level.strip() or "초급",
        "tags": tags,
        "char_count": char_count,
        "word_count": word_count,
        "author_id": str(staff["id"]),
        "author_name": staff.get("nickname") or staff.get("email") or "선생님",
    }
    res = supabase.table("reading_passages").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="지문 등록에 실패했습니다.")
    return res.data[0]


# 2-1. 지문 수정 (관리자 또는 본인 작성 선생님) [신규 추가]
@router.patch("/passages/{passage_id}")
def update_reading_passage(
    passage_id: str,
    req: ReadingPassageUpdate,
    staff: dict = Depends(require_teacher_or_admin),
):
    existing = supabase.table("reading_passages").select("*").eq("id", passage_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="지문을 찾을 수 없습니다.")

    row = existing.data[0]
    if str(staff.get("grade") or "").upper() != "ADMIN" and str(row.get("author_id")) != str(staff["id"]):
        raise HTTPException(status_code=403, detail="본인이 작성한 지문만 수정할 수 있습니다.")

    char_count, word_count = compute_passage_stats(req.content)
    tags = [t.strip() for t in req.tags if t.strip()]

    payload = {
        "title": req.title.strip(),
        "content": req.content.strip(),
        "level": req.level.strip() or "초급",
        "tags": tags,
        "char_count": char_count,
        "word_count": word_count,
    }
    res = (
        supabase.table("reading_passages")
        .update(payload)
        .eq("id", passage_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="지문 수정에 실패했습니다.")
    return res.data[0]


# 3. 지문 삭제 (관리자 또는 본인 작성 선생님)
@router.delete("/passages/{passage_id}")
def delete_reading_passage(
    passage_id: str,
    staff: dict = Depends(require_teacher_or_admin),
):
    existing = supabase.table("reading_passages").select("*").eq("id", passage_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="지문을 찾을 수 없습니다.")

    row = existing.data[0]
    if str(staff.get("grade") or "").upper() != "ADMIN" and str(row.get("author_id")) != str(staff["id"]):
        raise HTTPException(status_code=403, detail="본인이 작성한 지문만 삭제할 수 있습니다.")

    supabase.table("reading_passages").delete().eq("id", passage_id).execute()
    return {"message": "지문이 삭제되었습니다."}


# 4. 읽기 녹음 제출 및 정확도·속도(CPM/WPM) 평가 저장
@router.post("/submit")
async def submit_reading_attempt(
    passage_id: str = Form(...),
    duration_seconds: float = Form(...),
    recognized_text: str = Form(""),
    is_public: bool = Form(False),
    audio_file: UploadFile = File(...),
    user: Optional[dict] = Depends(get_optional_user),
):
    p_res = supabase.table("reading_passages").select("*").eq("id", passage_id).execute()
    if not p_res.data:
        raise HTTPException(status_code=404, detail="대상 지문을 찾을 수 없습니다.")
    passage = p_res.data[0]

    ext = os.path.splitext(audio_file.filename or "")[1].lower()
    if ext not in {".webm", ".mp4", ".m4a", ".ogg", ".wav", ".mp3"}:
        ext = ".webm"

    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="녹음된 오디오 데이터가 비어 있습니다.")

    storage_path = f"attempts/{passage_id}/{uuid.uuid4().hex}{ext}"
    try:
        supabase.storage.from_("reading-audio").upload(
            path=storage_path,
            file=audio_bytes,
            file_options={"content-type": audio_file.content_type or "audio/webm"},
        )
        audio_url = supabase.storage.from_("reading-audio").get_public_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"녹음 파일 저장 실패: {str(e)}")

    safe_duration = max(0.3, round(float(duration_seconds), 2))
    accuracy, diff_tokens = evaluate_reading_accuracy(passage["content"], recognized_text)

    char_count = int(passage.get("char_count") or 0)
    word_count = int(passage.get("word_count") or 0)
    cpm = round((char_count / safe_duration) * 60)
    wpm = round((word_count / safe_duration) * 60)

    effective_public = bool(is_public) if user else False

    payload = {
        "passage_id": passage_id,
        "user_id": str(user["id"]) if user else None,
        "user_nickname": user.get("nickname", "회원") if user else "비회원(게스트)",
        "audio_url": audio_url,
        "recognized_text": recognized_text.strip(),
        "accuracy_score": accuracy,
        "duration_seconds": safe_duration,
        "cpm": cpm,
        "wpm": wpm,
        "diff_tokens": diff_tokens,
        "is_public": effective_public,
    }
    ins = supabase.table("reading_attempts").insert(payload).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="측정 결과 저장에 실패했습니다.")

    saved = ins.data[0]
    saved["passage_title"] = passage["title"]
    saved["char_count"] = char_count
    saved["word_count"] = word_count
    return saved


# 5-1. 전체 지문의 모든 공개 기록 통합 조회 [신규 추가]
@router.get("/public-attempts")
def list_all_public_attempts(
    sort_by: str = Query("recent", description="accuracy | speed | recent"),
    user: Optional[dict] = Depends(require_module_access("korean_reading")),
):
    query = (
        supabase.table("reading_attempts")
        .select("*, reading_passages(title, level)")
        .eq("is_public", True)
    )
    if sort_by == "speed":
        query = query.order("cpm", desc=True).order("accuracy_score", desc=True)
    elif sort_by == "accuracy":
        query = query.order("accuracy_score", desc=True).order("cpm", desc=True)
    else:
        query = query.order("created_at", desc=True)

    res = query.limit(100).execute()
    return res.data or []


# 5-2. 특정 지문의 공개된 다른 사용자 기록 조회 (is_public = True 만 노출)
@router.get("/passages/{passage_id}/public-attempts")
def list_public_attempts_for_passage(
    passage_id: str,
    sort_by: str = Query("accuracy", description="accuracy | speed | recent"),
    user: Optional[dict] = Depends(require_module_access("korean_reading")),
):
    query = (
        supabase.table("reading_attempts")
        .select("*, reading_passages(title, level)")
        .eq("passage_id", passage_id)
        .eq("is_public", True)
    )
    if sort_by == "speed":
        query = query.order("cpm", desc=True).order("accuracy_score", desc=True)
    elif sort_by == "recent":
        query = query.order("created_at", desc=True)
    else:
        query = query.order("accuracy_score", desc=True).order("cpm", desc=True)

    res = query.limit(100).execute()
    return res.data or []


# 6. 내 읽기 기록 조회
@router.get("/my-attempts")
def list_my_reading_attempts(current_user: dict = Depends(get_current_user)):
    res = (
        supabase.table("reading_attempts")
        .select("*, reading_passages(title, level, char_count)")
        .eq("user_id", str(current_user["id"]))
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return res.data or []


# 7. 내 기록 공개/비공개 전환 토글
@router.patch("/attempts/{attempt_id}/visibility")
def update_attempt_visibility(
    attempt_id: str,
    req: ReadingVisibilityUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = supabase.table("reading_attempts").select("*").eq("id", attempt_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    row = existing.data[0]
    if str(row.get("user_id")) != str(current_user["id"]) and str(current_user.get("grade") or "").upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="본인의 기록만 공개 설정을 변경할 수 있습니다.")

    res = (
        supabase.table("reading_attempts")
        .update({"is_public": req.is_public})
        .eq("id", attempt_id)
        .execute()
    )
    return res.data[0]


# 8. 내 녹음 기록 삭제 (오디오 스토리지 파일 포함) [신규 추가]
@router.delete("/attempts/{attempt_id}")
def delete_my_reading_attempt(
    attempt_id: str,
    current_user: dict = Depends(get_current_user),
):
    existing = supabase.table("reading_attempts").select("*").eq("id", attempt_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="기록을 찾을 수 없습니다.")

    row = existing.data[0]
    if str(row.get("user_id")) != str(current_user["id"]) and str(current_user.get("grade") or "").upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="본인의 녹음 기록만 삭제할 수 있습니다.")

    # Supabase Storage 파일 삭제 시도
    audio_url = row.get("audio_url") or ""
    marker = "/reading-audio/"
    if marker in audio_url:
        storage_path = unquote(audio_url.split(marker, 1)[1].split("?", 1)[0])
        try:
            supabase.storage.from_("reading-audio").remove([storage_path])
        except Exception:
            pass

    supabase.table("reading_attempts").delete().eq("id", attempt_id).execute()
    return {"message": "녹음 기록이 삭제되었습니다."}