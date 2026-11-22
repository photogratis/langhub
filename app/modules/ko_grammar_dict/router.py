import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.admin.router import require_admin
from app.modules.ko_grammar_dict.schemas import (
    GrammarCreateRequest,
    GrammarResponse,
    PaginatedGrammarResponse,
)

router = APIRouter()


@router.get("/items", response_model=PaginatedGrammarResponse)
def search_grammar(
    q: Optional[str] = Query(None, description="문법 패턴 또는 인도네시아어 의미 검색"),
    tag: Optional[str] = Query(None, description="태그 검색"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    page_size: int = Query(15, ge=1, le=200, description="페이지당 항목 수"),
    user: Optional[dict] = Depends(require_module_access("ko_grammar_dict")),
):
    try:
        query = supabase.table("ko_grammar_dictionary").select("*", count="exact").order("pattern", desc=False)
        if q and q.strip():
            keyword = q.strip()
            query = query.or_(f"pattern.ilike.%{keyword}%,meaning_id.ilike.%{keyword}%")

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
        raise HTTPException(status_code=500, detail=f"문법사전 조회 오류: {str(e)}")

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/items", response_model=GrammarResponse)
def create_grammar(
    req: GrammarCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "pattern": req.pattern.strip(),
        "meaning_id": req.meaning_id.strip(),
        "usage_rule": req.usage_rule.strip(),
        "level": req.level.strip(),
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }
    try:
        res = supabase.table("ko_grammar_dictionary").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"문법 등록 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=500, detail="문법 등록에 실패했습니다.")
    return res.data[0]


@router.put("/items/{grammar_uuid}", response_model=GrammarResponse)
def update_grammar(
    grammar_uuid: str,
    req: GrammarCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "pattern": req.pattern.strip(),
        "meaning_id": req.meaning_id.strip(),
        "usage_rule": req.usage_rule.strip(),
        "level": req.level.strip(),
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }
    try:
        res = supabase.table("ko_grammar_dictionary").update(payload).eq("id", grammar_uuid).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"문법 수정 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=404, detail="수정할 문법 항목을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/items/{grammar_uuid}")
def delete_grammar(grammar_uuid: str, admin: dict = Depends(require_admin)):
    supabase.table("ko_grammar_dictionary").delete().eq("id", grammar_uuid).execute()
    return {"message": "문법 항목이 삭제되었습니다."}