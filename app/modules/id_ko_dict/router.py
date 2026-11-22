import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.admin.router import require_admin
from app.modules.id_ko_dict.schemas import (
    DictWordCreateRequest,
    DictWordResponse,
    PaginatedDictResponse,
)
from app.modules.id_ko_dict.corpus_hook import fetch_linked_corpus

router = APIRouter()


def _prepare_word_payload(req: DictWordCreateRequest) -> dict:
    clean_word = req.word_id.strip()
    # 어근인 경우 root_word가 비어 있으면 자기 자신을 어근으로 자동 설정
    if req.is_root:
        clean_root = (req.root_word or "").strip() or clean_word
        affix_type = "어근"
        cleaned_affixes = []
    else:
        clean_root = (req.root_word or "").strip() or clean_word
        affix_type = req.affix_type.strip() or "파생어"
        cleaned_affixes = [a.strip() for a in req.affixes if a.strip()]

    return {
        "word_id": clean_word,
        "meaning_ko": req.meaning_ko.strip(),
        "pos": req.pos.strip(),
        "is_root": req.is_root,
        "root_word": clean_root,
        "affix_type": affix_type,
        "affixes": cleaned_affixes,
        "dialect": (req.dialect or "표준어 (Bahasa Baku)").strip(),
        "origin": (req.origin or "고유어").strip(),
        "origin_note": (req.origin_note or "").strip(),
        "synonyms": [s.strip() for s in req.synonyms if s.strip()],
        "antonyms": [a.strip() for a in req.antonyms if a.strip()],
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }


def _attach_related_root_words(items: list) -> None:
    """
    현재 페이지에 노출되는 단어들의 root_word를 수집하여,
    DB에서 동일한 어근(root_word)을 가진 모든 단어(어근 + 접사 파생어)를 한 번에 묶어 매핑
    """
    roots = {
        (item.get("root_word") or item.get("word_id") or "").strip().lower()
        for item in items
        if (item.get("root_word") or item.get("word_id"))
    }
    if not roots:
        return

    res = (
        supabase.table("id_ko_dictionary")
        .select("id, word_id, meaning_ko, pos, is_root, root_word, affix_type, affixes")
        .order("is_root", desc=True)
        .order("word_id", desc=False)
        .execute()
    )
    all_rows = res.data or []

    grouped_by_root: dict[str, list] = {}
    for row in all_rows:
        r_key = (row.get("root_word") or row.get("word_id") or "").strip().lower()
        if r_key in roots:
            grouped_by_root.setdefault(r_key, []).append(row)

    for item in items:
        r_key = (item.get("root_word") or item.get("word_id") or "").strip().lower()
        family = grouped_by_root.get(r_key, [])
        # 자기 자신을 제외한 동일 어근 단어들만 관련 단어로 연결
        item["related_root_words"] = [
            f for f in family if str(f["id"]) != str(item["id"])
        ]


@router.get("/words", response_model=PaginatedDictResponse)
def search_words(
    q: Optional[str] = Query(None, description="단어, 뜻 또는 어근 검색"),
    tag: Optional[str] = Query(None, description="태그 검색"),
    dialect: Optional[str] = Query(None, description="방언/지역어 필터"),
    origin: Optional[str] = Query(None, description="어원/유래 필터"),
    affix_filter: Optional[str] = Query(None, description="어근/접사 필터 (ROOT | AFFIXED)"),
    page: int = Query(1, ge=1, description="페이지 번호"),
    page_size: int = Query(15, ge=1, le=200, description="페이지당 항목 수"),
    user: Optional[dict] = Depends(require_module_access("id_ko_dict")),
):
    try:
        query = supabase.table("id_ko_dictionary").select("*", count="exact").order("word_id", desc=False)

        if q and q.strip():
            kw = q.strip()
            query = query.or_(f"word_id.ilike.%{kw}%,meaning_ko.ilike.%{kw}%,root_word.ilike.%{kw}%")

        if dialect and dialect.strip():
            query = query.ilike("dialect", f"%{dialect.strip()}%")

        if origin and origin.strip():
            query = query.ilike("origin", f"%{origin.strip()}%")

        if affix_filter == "ROOT":
            query = query.eq("is_root", True)
        elif affix_filter == "AFFIXED":
            query = query.eq("is_root", False)

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
        raise HTTPException(status_code=500, detail=f"인한사전 조회 오류: {str(e)}")

    _attach_related_root_words(items)
    for item in items:
        item["grammar_corpus"] = fetch_linked_corpus(item["word_id"])

    total_pages = max(1, math.ceil(total / page_size))
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.post("/words", response_model=DictWordResponse)
def create_word(
    req: DictWordCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = _prepare_word_payload(req)
    try:
        res = supabase.table("id_ko_dictionary").insert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=500, detail="단어 등록에 실패했습니다.")
    created = res.data[0]
    _attach_related_root_words([created])
    created["grammar_corpus"] = []
    return created


@router.put("/words/{word_uuid}", response_model=DictWordResponse)
def update_word(
    word_uuid: str,
    req: DictWordCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = _prepare_word_payload(req)
    try:
        res = supabase.table("id_ko_dictionary").update(payload).eq("id", word_uuid).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"단어 수정 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=404, detail="수정할 단어를 찾을 수 없습니다.")
    updated = res.data[0]
    _attach_related_root_words([updated])
    updated["grammar_corpus"] = fetch_linked_corpus(updated["word_id"])
    return updated

 
@router.delete("/words/{word_uuid}")
def delete_word(word_uuid: str, admin: dict = Depends(require_admin)):
    supabase.table("id_ko_dictionary").delete().eq("id", word_uuid).execute()
    return {"message": "단어가 삭제되었습니다."}