from pydantic import BaseModel
from typing import Dict, List, Optional


class AnalyzeTextRequest(BaseModel):
    text: str


class WordAnalysisItem(BaseModel):
    token: str                          # 원문 어절 (예: "밥을")
    stem: str                           # 추출된 기본 단어/어간 (예: "밥")
    josa: Optional[str] = None          # 분리된 조사 (예: "을")
    josa_meaning_id: Optional[str] = None
    dict_matches: List[dict] = []       # 한-인사전 DB 매칭 결과


class AnalyzeTextResponse(BaseModel):
    total_chars_with_space: int
    total_chars_without_space: int
    hangul_syllable_count: int
    chosung_counts: Dict[str, int]
    jungsung_counts: Dict[str, int]
    jongsung_counts: Dict[str, int]
    word_analyses: List[WordAnalysisItem]
    matched_grammars: List[dict]