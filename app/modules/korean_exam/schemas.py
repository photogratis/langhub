from pydantic import BaseModel, Field
from typing import List, Optional


class ChoiceItem(BaseModel):
    id: str
    text: str = ""
    image_url: str = ""
    audio_url: str = ""
    tts_text: str = ""


class QuestionGroupCreate(BaseModel):
    title: str = Field(..., min_length=1)
    instruction: str = Field(..., min_length=1)
    passage_text: str = ""
    image_url: str = ""
    audio_url: str = ""
    tts_text: str = ""
    level: str = "초급"
    category: str = "읽기"
    sample_count: int = Field(0, ge=0)
    tags: List[str] = Field(default_factory=list)


class ExamQuestionCreate(BaseModel):
    group_id: Optional[str] = None
    order_in_group: int = 1
    question_type: str = Field("MCQ")
    level: str = "초급"
    category: str = "읽기"
    points: int = Field(10, ge=1)
    prompt_text: str = Field(..., min_length=1)
    passage_text: str = ""
    image_url: str = ""
    audio_url: str = ""
    tts_text: str = ""
    shuffle_choices: bool = True
    choices: List[ChoiceItem] = Field(default_factory=list)
    correct_choice_id: str = ""
    correct_answers: List[str] = Field(default_factory=list)
    explanation: str = ""
    tags: List[str] = Field(default_factory=list)


class ExamPaperItemSpec(BaseModel):
    question_id: str
    points: int = Field(10, ge=1)
    order_no: int = Field(1, ge=1)


class ExamPaperCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    level: str = "혼합"
    category: str = "종합"
    time_limit_seconds: int = Field(600, ge=10, le=7200)
    is_published: bool = True
    items: List[ExamPaperItemSpec] = Field(..., min_length=1)


class ExamGenerateRequest(BaseModel):
    exam_title: str = "한국어 실력 평가 모의고사"
    level: Optional[str] = None
    category: Optional[str] = None
    question_type: Optional[str] = None
    max_questions: int = Field(10, ge=1, le=100)
    time_limit_seconds: int = Field(600, ge=10, le=7200)
    tag: Optional[str] = None


class ExamRetryRequest(BaseModel):
    attempt_id: str
    retry_mode: str = Field("RETRY_WRONG")
    time_limit_seconds: Optional[int] = Field(None, ge=10, le=7200)


class UserSubmittedAnswer(BaseModel):
    question_id: str
    display_no: int
    points: Optional[int] = None
    selected_choice_id: Optional[str] = None
    short_answer_text: Optional[str] = None


class ExamSubmitRequest(BaseModel):
    exam_title: str = "한국어 실력 평가 모의고사"
    elapsed_seconds: int = 0
    time_limit_seconds: int = 600
    series_id: Optional[str] = None
    attempt_mode: str = "NEW"
    answers: List[UserSubmittedAnswer]