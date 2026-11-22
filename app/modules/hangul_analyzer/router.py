from typing import Optional
from fastapi import APIRouter, Depends
from app.core.module_guard import require_module_access
from app.modules.hangul_analyzer.schemas import AnalyzeTextRequest, AnalyzeTextResponse
from app.modules.hangul_analyzer.analyzer import analyze_korean_text

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeTextResponse)
def analyze_text_endpoint(
    req: AnalyzeTextRequest,
    user: Optional[dict] = Depends(require_module_access("hangul_analyzer")),
):
    return analyze_korean_text(req.text)