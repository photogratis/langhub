from pydantic import BaseModel

class UserUpdateRequest(BaseModel):
    nickname: str