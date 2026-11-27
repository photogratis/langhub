from pydantic import BaseModel, Field
from typing import List, Optional


class ReadingGroupCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    title_id: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field("")
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)


class ReadingGroupUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    title_id: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field("")
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)


class ReadingPassageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=2)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)
    group_id: Optional[str] = Field(None)
    group_order: Optional[int] = Field(1, ge=1)


class ReadingPassageUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=2)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)
    group_id: Optional[str] = Field(None)
    group_order: Optional[int] = Field(1, ge=1)


class ReadingVisibilityUpdate(BaseModel):
    is_public: bool