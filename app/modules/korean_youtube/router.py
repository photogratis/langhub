from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.auth.dependencies import get_current_user
from app.modules.korean_youtube.schemas import (
    YoutubeExtractRequest,
    YoutubeVideoCreate,
    YoutubeVideoUpdate,
)
from app.modules.korean_youtube.service import (
    extract_youtube_video_id,
    fetch_and_merge_subtitles,
)

router = APIRouter()


def require_staff(current_user: dict = Depends(get_current_user)) -> dict:
    grade = str(current_user.get("grade") or "").strip().upper()
    if grade not in ("ADMIN", "TEACHER"):
        raise HTTPException(status_code=403, detail="관리자(ADMIN) 또는 선생님(TEACHER) 권한이 필요합니다.")
    return current_user


# 1. 등록된 유튜브 학습 영상 목록 조회
@router.get("/videos")
def list_youtube_videos(
    level: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user: Optional[dict] = Depends(require_module_access("korean_youtube")),
):
    query = supabase.table("korean_youtube_videos").select("*").order("created_at", desc=True)
    if level:
        query = query.eq("level", level)
    if tag and tag.strip():
        query = query.contains("tags", [tag.strip()])
    if q and q.strip():
        query = query.ilike("title", f"%{q.strip()}%")

    res = query.execute()
    return res.data or []


# 2. 유튜브 URL에서 기존 자막 + 자동번역 자막 추출 미리보기
@router.post("/extract-subtitles")
def extract_youtube_subtitles(
    req: YoutubeExtractRequest,
    staff: dict = Depends(require_staff),
):
    try:
        video_id = extract_youtube_video_id(req.youtube_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        source_type, subtitles = fetch_and_merge_subtitles(
            video_id=video_id,
            auto_translate_id=req.auto_translate_id,
        )
        return {
            "video_id": video_id,
            "subtitle_source": source_type,
            "subtitles": subtitles,
            "has_captions": True,
        }
    except LookupError as e:
        # 자막이 없는 영상일 경우에도 video_id는 반환하여 프론트에서 STT(음성인식) 캡처로 이어갈 수 있게 함
        return {
            "video_id": video_id,
            "subtitle_source": "NO_CAPTION",
            "subtitles": [],
            "has_captions": False,
            "message": str(e),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"자막 추출 오류: {str(e)}")


# 3. 유튜브 학습 자료 최종 DB 저장
@router.post("/videos")
def create_youtube_video(
    req: YoutubeVideoCreate,
    staff: dict = Depends(require_staff),
):
    try:
        video_id = extract_youtube_video_id(req.youtube_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    payload = {
        "video_id": video_id,
        "youtube_url": req.youtube_url.strip(),
        "title": req.title.strip(),
        "level": req.level.strip() or "초급",
        "tags": [t.strip() for t in req.tags if t.strip()],
        "description": req.description.strip(),
        "subtitle_source": req.subtitle_source,
        "subtitles": [s.model_dump() for s in req.subtitles],
        "author_id": str(staff["id"]),
        "author_name": staff.get("nickname") or staff.get("email") or "선생님",
    }
    res = supabase.table("korean_youtube_videos").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="영상 저장에 실패했습니다.")
    return res.data[0]


# 4. 영상 및 자막 수정
@router.patch("/videos/{item_id}")
def update_youtube_video(
    item_id: str,
    req: YoutubeVideoUpdate,
    staff: dict = Depends(require_staff),
):
    payload = {
        "title": req.title.strip(),
        "level": req.level.strip() or "초급",
        "tags": [t.strip() for t in req.tags if t.strip()],
        "description": req.description.strip(),
        "subtitles": [s.model_dump() for s in req.subtitles],
    }
    res = supabase.table("korean_youtube_videos").update(payload).eq("id", item_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="대상을 찾을 수 없습니다.")
    return res.data[0]


# 5. 삭제
@router.delete("/videos/{item_id}")
def delete_youtube_video(
    item_id: str,
    staff: dict = Depends(require_staff),
):
    supabase.table("korean_youtube_videos").delete().eq("id", item_id).execute()
    return {"message": "삭제되었습니다."}