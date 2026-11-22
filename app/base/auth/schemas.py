from pydantic import BaseModel, EmailStr
from uuid import UUID

class UserSignupRequest(BaseModel):
    email: EmailStr
    password: str
    nickname: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    nickname: str
    grade: str
    is_active: bool = True

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"