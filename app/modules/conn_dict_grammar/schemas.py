from pydantic import BaseModel, Field
from typing import List, Optional


class LinkedCorpusCreateRequest(BaseModel):
    dict_word_id: str = Field(..., description="한-인사전 단어 UUID")
    grammar_id: str = Field(..., description="한국어 문법 UUID")
    sentence_ko: str = Field(..., min_length=1, description="단어+문법 결합 한국어 예문")
    sentence_id: str = Field(..., min_length=1, description="인도네시아어 번역")
    note: str = Field("", description="활용 형태 설명 (예: 먹다 + -어서 → 먹어서)")


class LinkedCorpusResponse(BaseModel):
    id: str
    dict_word_id: str
    grammar_id: str
    sentence_ko: str
    sentence_id: str
    note: str = ""
    created_at: Optional[str] = None
    ko_id_dictionary: Optional[dict] = None
    ko_grammar_dictionary: Optional[dict] = None


class PaginatedCorpusResponse(BaseModel):
    items: List[LinkedCorpusResponse]
    total: int
    page: int
    page_size: int
    total_pages: int