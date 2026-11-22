from pydantic import BaseModel
from typing import Literal, List

class GradeCreateRequest(BaseModel):
    code: str
    name: str
    description: str = ""
    level: int = 1

class AdminUserUpdateRequest(BaseModel):
    grade: str
    is_active: bool

class ModulePolicyUpdateRequest(BaseModel):
    is_enabled: bool
    access_type: Literal["PUBLIC", "MEMBER", "GRADE"]
    allowed_grades: List[str] = []