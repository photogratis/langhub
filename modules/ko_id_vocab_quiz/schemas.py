from pydantic import BaseModel, Field
from typing import List, Optional


class QuizGenerateRequest(BaseModel):
    question_count: int = Field(10, ge=1, le=100, description="출제할 문제 수")
    time_limit_seconds: int = Field(180, ge=10, le=3600, description="제한 시간(초)")
    direction: str = Field("ko_to_id", description="출제 방향: ko_to_id(한국어→인니어) | id_to_ko(인니어→한국어) | mixed(혼합)")
    tag: Optional[str] = Field(None, description="특정 태그 단어만 출제 시 태그명")


class QuizChoice(BaseModel):
    choice_id: str
    text: str


class QuizQuestion(BaseModel):
    question_no: int
    word_id: str
    direction: str
    prompt_word: str
    pos: str
    choices: List[QuizChoice]
    correct_choice_id: str
    correct_text: str


class QuizGenerateResponse(BaseModel):
    total_available_words: int
    question_count: int
    time_limit_seconds: int
    questions: List[QuizQuestion]


class UserAnswerItem(BaseModel):
    question_no: int
    word_id: str
    direction: str
    prompt_word: str
    pos: str
    selected_choice_id: Optional[str] = None
    selected_text: Optional[str] = None
    correct_choice_id: str
    correct_text: str


class QuizGradeRequest(BaseModel):
    elapsed_seconds: int = Field(0, ge=0, description="실제 소요 시간(초)")
    answers: List[UserAnswerItem]


class GradedQuestionResult(BaseModel):
    question_no: int
    prompt_word: str
    pos: str
    is_correct: bool
    user_answer_text: str
    correct_answer_text: str


class QuizGradeResponse(BaseModel):
    total_questions: int
    correct_count: int
    wrong_count: int
    score: int
    elapsed_seconds: int
    results: List[GradedQuestionResult]