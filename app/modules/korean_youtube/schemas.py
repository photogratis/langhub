from pydantic import BaseModel, Field
from typing import List, Optional


class SubtitleLine(BaseModel):
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    ko: str = ""
    id: str = ""
    source: str = "CAPTION"  # CAPTION | AUTO_TRANSLATE | STT


class YoutubeExtractRequest(BaseModel):
    youtube_url: str = Field(..., min_length=5)
    auto_translate_id: bool = True


class YoutubeVideoCreate(BaseModel):
    youtube_url: str = Field(..., min_length=5)
    title: str = Field(..., min_length=1, max_length=200)
    level: str = Field("초급")
    tags: List[str] = Field(default_factory=list)
    description: str = ""
    subtitle_source: str = "YOUTUBE_CAPTION"
    subtitles: List[SubtitleLine] = Field(default_factory=list)


class YoutubeVideoUpdate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    level: str = Field("초급")
    tags: List[str] = Field(default_factory=list)
    description: str = ""
    subtitles: List[SubtitleLine] = Field(default_factory=list)