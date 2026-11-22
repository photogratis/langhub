from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.database import supabase
from app.core.security import hash_password, verify_password
from app.core.validators import validate_and_check_nickname
from app.base.auth.dependencies import get_current_user

router = APIRouter()


class NicknameUpdateRequest(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=20)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)
    new_password_confirm: str = Field(..., min_length=6)


@router.patch("/me/nickname")
def update_my_nickname(
    req: NicknameUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    clean_nickname = validate_and_check_nickname(req.nickname, exclude_user_id=current_user["id"])

    if clean_nickname == current_user["nickname"]:
        return {"message": "기존과 동일한 닉네임입니다.", "nickname": clean_nickname}

    res = (
        supabase.table("users")
        .update({
            "nickname": clean_nickname,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", current_user["id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="닉네임 변경에 실패했습니다.")

    return {"message": "닉네임이 변경되었습니다.", "nickname": clean_nickname}


@router.patch("/me/password")
def change_my_password(
    req: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    if req.new_password != req.new_password_confirm:
        raise HTTPException(status_code=400, detail="새 비밀번호와 비밀번호 확인이 일치하지 않습니다.")

    if req.current_password == req.new_password:
        raise HTTPException(status_code=400, detail="현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.")

    user_res = supabase.table("users").select("password_hash").eq("id", current_user["id"]).execute()
    if not user_res.data or not verify_password(req.current_password, user_res.data[0]["password_hash"]):
        raise HTTPException(status_code=400, detail="현재 비밀번호가 일치하지 않습니다.")

    supabase.table("users").update({
        "password_hash": hash_password(req.new_password),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", current_user["id"]).execute()

    return {"message": "비밀번호가 안전하게 변경되었습니다."}