from pydantic import BaseModel, Field
from typing import List, Optional


class ExampleSentence(BaseModel):
    ko: str
    id: str


class KoDictWordCreateRequest(BaseModel):
    word_ko: str = Field(..., min_length=1, description="한국어 표제어")
    meaning_id: str = Field(..., min_length=1, description="인도네시아어 뜻")
    pos: str = Field(..., description="품사 (명사, 동사, 형용사 등)")
    synonyms: List[str] = Field(default_factory=list, description="유의어 목록")
    antonyms: List[str] = Field(default_factory=list, description="반대말 목록")
    examples: List[ExampleSentence] = Field(default_factory=list, description="예문 목록")
    tags: List[str] = Field(default_factory=list, description="태그 목록")


class KoDictWordResponse(BaseModel):
    id: str
    word_ko: str
    meaning_id: str
    pos: str
    synonyms: List[str] = []
    antonyms: List[str] = []
    examples: List[dict] = []
    tags: List[str] = []
    grammar_corpus: List[dict] = []
    created_at: Optional[str] = None


class PaginatedKoDictResponse(BaseModel):
    items: List[KoDictWordResponse]
    total: int
    page: int
    page_size: int
    total_pages: int