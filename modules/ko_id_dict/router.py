import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.admin.router import require_admin
from app.modules.ko_id_dict.schemas import (
    KoDictWordCreateRequest,
    KoDictWordResponse,
    PaginatedKoDictResponse,
)
from app.modules.ko_id_dict.corpus_hook import fetch_linked_corpus

router = APIRouter()


@router.get("/words", response_model=PaginatedKoDictResponse)
def search_words(
    q: Optional[str] = Query(None, description="한국어 단어 또는 인도네시아어 뜻 검색"),
    tag: Optional[str] = Query(None, description="태그 검색"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    page_size: int = Query(15, ge=1, le=200, description="페이지당 항목 수"),
    user: Optional[dict] = Depends(require_module_access("ko_id_dict")),
):
    try:
        query = supabase.table("ko_id_dictionary").select("*", count="exact").order("word_ko", desc=False)
        if q and q.strip():
            keyword = q.strip()
            query = query.or_(f"word_ko.ilike.%{keyword}%,meaning_id.ilike.%{keyword}%")

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"사전 조회 오류: {str(e)}")

    for item in items:
        item["grammar_corpus"] = fetch_linked_corpus(item["word_ko"])

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/words", response_model=KoDictWordResponse)
def create_word(
    req: KoDictWordCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "word_ko": req.word_ko.strip(),
        "meaning_id": req.meaning_id.strip(),
        "pos": req.pos.strip(),
        "synonyms": [s.strip() for s in req.synonyms if s.strip()],
        "antonyms": [a.strip() for a in req.antonyms if a.strip()],
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }
    try:
        res = supabase.table("ko_id_dictionary").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=500, detail="단어 등록에 실패했습니다.")
    created = res.data[0]
    created["grammar_corpus"] = []
    return created


@router.put("/words/{word_uuid}", response_model=KoDictWordResponse)
def update_word(
    word_uuid: str,
    req: KoDictWordCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "word_ko": req.word_ko.strip(),
        "meaning_id": req.meaning_id.strip(),
        "pos": req.pos.strip(),
        "synonyms": [s.strip() for s in req.synonyms if s.strip()],
        "antonyms": [a.strip() for a in req.antonyms if a.strip()],
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }
    try:
        res = supabase.table("ko_id_dictionary").update(payload).eq("id", word_uuid).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"단어 수정 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=404, detail="수정할 단어를 찾을 수 없습니다.")
    updated = res.data[0]
    updated["grammar_corpus"] = fetch_linked_corpus(updated["word_ko"])
    return updated


@router.delete("/words/{word_uuid}")
def delete_word(word_uuid: str, admin: dict = Depends(require_admin)):
    supabase.table("ko_id_dictionary").delete().eq("id", word_uuid).execute()
    return {"message": "단어가 삭제되었습니다."}