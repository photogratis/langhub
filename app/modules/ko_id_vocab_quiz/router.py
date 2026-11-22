from typing import Optional
from fastapi import APIRouter, Depends
from app.core.module_guard import require_module_access
from app.modules.ko_id_vocab_quiz.schemas import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizGradeRequest,
    QuizGradeResponse,
)
from app.modules.ko_id_vocab_quiz.service import generate_vocab_quiz, grade_vocab_quiz

router = APIRouter()


@router.post("/generate", response_model=QuizGenerateResponse)
def create_quiz(
    req: QuizGenerateRequest,
    user: Optional[dict] = Depends(require_module_access("ko_id_vocab_quiz")),
):
    return generate_vocab_quiz(req)


@router.post("/grade", response_model=QuizGradeResponse)
def submit_and_grade_quiz(
    req: QuizGradeRequest,
    user: Optional[dict] = Depends(require_module_access("ko_id_vocab_quiz")),
):
    return grade_vocab_quiz(req)