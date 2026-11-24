from pydantic import BaseModel, Field
from typing import List, Optional


class ReadingGroupCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=500)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)


class ReadingGroupUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field("", max_length=500)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)


class ReadingPassageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=2)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)
    group_id: Optional[str] = None
    group_order: int = Field(1, ge=1)


class ReadingPassageUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=2)
    level: str = Field("초급", description="초급 | 중급 | 고급")
    tags: List[str] = Field(default_factory=list)
    group_id: Optional[str] = None
    group_order: int = Field(1, ge=1)


class ReadingVisibilityUpdate(BaseModel):
    is_public: bool