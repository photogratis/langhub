from pydantic import BaseModel, Field
from typing import List, Optional


class ExampleSentence(BaseModel):
    id: str
    ko: str


class RelatedRootWord(BaseModel):
    id: str
    word_id: str
    meaning_ko: str
    pos: str
    is_root: bool = True
    affix_type: str = "어근"
    affixes: List[str] = []


class DictWordCreateRequest(BaseModel):
    word_id: str = Field(..., min_length=1, description="인도네시아어 표제어")
    meaning_ko: str = Field(..., min_length=1, description="한국어 뜻")
    pos: str = Field(..., description="품사")
    # 형태소(어근/접사) 정보
    is_root: bool = Field(True, description="어근 여부")
    root_word: Optional[str] = Field(None, description="어근 표제어")
    affix_type: str = Field("어근", description="접사 유형 (어근, 접두사, 접미사, 중간접사, 양쪽접사, 복합접사)")
    affixes: List[str] = Field(default_factory=list, description="추가된 접사 목록 (예: me-, -kan, -el-)")
    # 방언(지역어) 및 어원(유래) 정보
    dialect: str = Field("표준어 (Bahasa Baku)", description="방언/지역어 구분")
    origin: str = Field("고유어", description="단어의 유래/어원")
    origin_note: str = Field("", description="어원 상세 메모 (예: 네덜란드어 'kantoor'에서 유래)")
    # 기존 필드
    synonyms: List[str] = Field(default_factory=list, description="유의어 목록")
    antonyms: List[str] = Field(default_factory=list, description="반대말 목록")
    examples: List[ExampleSentence] = Field(default_factory=list, description="예문 목록")
    tags: List[str] = Field(default_factory=list, description="태그 목록")


class DictWordResponse(BaseModel):
    id: str
    word_id: str
    meaning_ko: str
    pos: str
    is_root: bool = True
    root_word: Optional[str] = None
    affix_type: str = "어근"
    affixes: List[str] = []
    dialect: str = "표준어 (Bahasa Baku)"
    origin: str = "고유어"
    origin_note: str = ""
    synonyms: List[str] = []
    antonyms: List[str] = []
    examples: List[dict] = []
    tags: List[str] = []
    related_root_words: List[RelatedRootWord] = []
    grammar_corpus: List[dict] = []
    created_at: Optional[str] = None


class PaginatedDictResponse(BaseModel):
    items: List[DictWordResponse]
    total: int
    page: int
    page_size: int
    total_pages: int