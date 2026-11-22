import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.admin.router import require_admin
from app.modules.conn_dict_grammar.schemas import (
    LinkedCorpusCreateRequest,
    PaginatedCorpusResponse,
)

router = APIRouter()


@router.get("/corpus", response_model=PaginatedCorpusResponse)
def list_linked_corpus(
    q: Optional[str] = Query(None, description="예문, 단어, 문법 패턴 또는 메모 검색"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    page_size: int = Query(15, ge=1, le=200, description="페이지당 항목 수"),
    user: Optional[dict] = Depends(require_module_access("conn_dict_grammar")),
):
    try:
        res = (
            supabase.table("dict_grammar_corpus")
            .select(
                "*, ko_id_dictionary(word_ko, meaning_id, pos), ko_grammar_dictionary(pattern, meaning_id, level)",
                count="exact",
            )
            .order("created_at", desc=True)
            .execute()
        )
        all_items = res.data or []

        if q and q.strip():
            kw = q.strip().lower()
            filtered = []
            for item in all_items:
                w = item.get("ko_id_dictionary") or {}
                g = item.get("ko_grammar_dictionary") or {}
                searchable = " ".join([
                    item.get("sentence_ko") or "",
                    item.get("sentence_id") or "",
                    item.get("note") or "",
                    w.get("word_ko") or "",
                    w.get("meaning_id") or "",
                    g.get("pattern") or "",
                    g.get("meaning_id") or "",
                ]).lower()
                if kw in searchable:
                    filtered.append(item)
        else:
            filtered = all_items

        total = len(filtered)
        start = (page - 1) * page_size
        paged_items = filtered[start : start + page_size]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"말뭉치 조회 오류: {str(e)}")

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "items": paged_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/corpus")
def create_linked_corpus(
    req: LinkedCorpusCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "dict_word_id": req.dict_word_id,
        "grammar_id": req.grammar_id,
        "sentence_ko": req.sentence_ko.strip(),
        "sentence_id": req.sentence_id.strip(),
        "note": req.note.strip(),
    }
    try:
        res = supabase.table("dict_grammar_corpus").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"말뭉치 저장 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=500, detail="말뭉치 등록에 실패했습니다.")
    return res.data[0]


@router.put("/corpus/{corpus_id}")
def update_linked_corpus(
    corpus_id: str,
    req: LinkedCorpusCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "dict_word_id": req.dict_word_id,
        "grammar_id": req.grammar_id,
        "sentence_ko": req.sentence_ko.strip(),
        "sentence_id": req.sentence_id.strip(),
        "note": req.note.strip(),
    }
    try:
        res = (
            supabase.table("dict_grammar_corpus")
            .update(payload)
            .eq("id", corpus_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"말뭉치 수정 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=404, detail="수정할 말뭉치를 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/corpus/{corpus_id}")
def delete_linked_corpus(corpus_id: str, admin: dict = Depends(require_admin)):
    supabase.table("dict_grammar_corpus").delete().eq("id", corpus_id).execute()
    return {"message": "연결된 말뭉치가 삭제되었습니다."}