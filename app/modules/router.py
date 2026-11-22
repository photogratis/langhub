from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.admin.router import require_admin
from app.modules.id_ko_dict.schemas import DictWordCreateRequest, DictWordResponse
from app.modules.id_ko_dict.corpus_hook import fetch_linked_corpus

router = APIRouter()

# 1. 단어 및 태그 통합 검색 (모듈 승인 조건에 따라 비회원/회원/특정등급 자동 제어)
@router.get("/words", response_model=List[DictWordResponse])
def search_words(
    q: Optional[str] = Query(None, description="단어 또는 한국어 뜻 검색"),
    tag: Optional[str] = Query(None, description="태그 검색"),
    user: Optional[dict] = Depends(require_module_access("id_ko_dict")),
):
    query = supabase.table("id_ko_dictionary").select("*").order("word_id", desc=False)

    if q and q.strip():
        keyword = q.strip()
        query = query.or_(f"word_id.ilike.%{keyword}%,meaning_ko.ilike.%{keyword}%")

    res = query.execute()
    items = res.data or []

    # 태그 필터링 (JSONB 배열 내 포함 여부)
    if tag and tag.strip():
        target_tag = tag.strip().lower()
        items = [
            item for item in items
            if any(target_tag in t.lower() for t in (item.get("tags") or []))
        ]

    # 각 단어에 문법 모듈 연결 말뭉치(있을 경우) 결합
    for item in items:
        item["grammar_corpus"] = fetch_linked_corpus(item["word_id"])

    return items

# 2. 새 단어 등록 (관리자 전용)
@router.post("/words", response_model=DictWordResponse)
def create_word(
    req: DictWordCreateRequest,
    admin: dict = Depends(require_admin),
):
    payload = {
        "word_id": req.word_id.strip(),
        "meaning_ko": req.meaning_ko.strip(),
        "pos": req.pos.strip(),
        "synonyms": [s.strip() for s in req.synonyms if s.strip()],
        "antonyms": [a.strip() for a in req.antonyms if a.strip()],
        "examples": [ex.model_dump() for ex in req.examples],
        "tags": [t.strip() for t in req.tags if t.strip()],
    }
    res = supabase.table("id_ko_dictionary").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="단어 등록에 실패했습니다.")
    created = res.data[0]
    created["grammar_corpus"] = []
    return created

# 3. 단어 삭제 (관리자 전용)
@router.delete("/words/{word_uuid}")
def delete_word(word_uuid: str, admin: dict = Depends(require_admin)):
    supabase.table("id_ko_dictionary").delete().eq("id", word_uuid).execute()
    return {"message": "단어가 삭제되었습니다."}