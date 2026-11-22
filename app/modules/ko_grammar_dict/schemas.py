from pydantic import BaseModel, Field
from typing import List, Optional


class GrammarExample(BaseModel):
    ko: str
    id: str


class GrammarCreateRequest(BaseModel):
    pattern: str = Field(..., min_length=1, description="문법 패턴 (예: -아/어서, -(으)려고)")
    meaning_id: str = Field(..., min_length=1, description="인도네시아어 의미/설명")
    usage_rule: str = Field("", description="결합 규칙 (예: 동사/형용사 어간 뒤)")
    level: str = Field("초급", description="난이도 (초급/중급/고급)")
    examples: List[GrammarExample] = Field(default_factory=list, description="예문 목록")
    tags: List[str] = Field(default_factory=list, description="태그 목록")


class GrammarResponse(BaseModel):
    id: str
    pattern: str
    meaning_id: str
    usage_rule: str = ""
    level: str = "초급"
    examples: List[dict] = []
    tags: List[str] = []
    created_at: Optional[str] = None


class PaginatedGrammarResponse(BaseModel):
    items: List[GrammarResponse]
    total: int
    page: int
    page_size: int
    total_pages: int