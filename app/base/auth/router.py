import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import Depends
from pydantic import BaseModel, EmailStr, Field

from app.core.database import supabase
from app.core.security import hash_password, verify_password, create_access_token
from app.core.validators import validate_and_check_nickname
from app.base.auth.dependencies import get_current_user

router = APIRouter()


class SignupRequest(BaseModel):
    email: EmailStr
    nickname: str = Field(..., min_length=2, max_length=20)
    password: str = Field(..., min_length=6)
    password_confirm: str = Field(..., min_length=6)


class PasswordResetRequestModel(BaseModel):
    email: EmailStr


class PasswordResetConfirmModel(BaseModel):
    email: EmailStr
    reset_code: str = Field(..., min_length=4)
    new_password: str = Field(..., min_length=6)
    new_password_confirm: str = Field(..., min_length=6)


@router.post("/signup")
def signup(req: SignupRequest):
    if req.password != req.password_confirm:
        raise HTTPException(status_code=400, detail="비밀번호와 비밀번호 확인이 일치하지 않습니다.")

    clean_nickname = validate_and_check_nickname(req.nickname)
    clean_email = req.email.strip().lower()

    existing_email = supabase.table("users").select("id").eq("email", clean_email).execute()
    if existing_email.data:
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")

    payload = {
        "email": clean_email,
        "nickname": clean_nickname,
        "password_hash": hash_password(req.password),
        "grade": "FREE",
        "is_active": True,
    }
    res = supabase.table("users").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="회원가입 처리 중 오류가 발생했습니다.")

    return {"message": "회원가입이 완료되었습니다."}


@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    clean_email = form_data.username.strip().lower()
    res = supabase.table("users").select("*").eq("email", clean_email).execute()
    if not res.data:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    user = res.data[0]
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="정지된 계정입니다. 관리자에게 문의하세요.")

    if not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")

    token = create_access_token({"sub": str(user["id"]), "email": user["email"]})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "nickname": current_user["nickname"],
        "grade": current_user["grade"],
        "is_active": current_user["is_active"],
    }


@router.post("/password-reset/request")
def request_password_reset(req: PasswordResetRequestModel):
    clean_email = req.email.strip().lower()
    res = supabase.table("users").select("id, email").eq("email", clean_email).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="해당 이메일로 가입된 회원을 찾을 수 없습니다.")

    user = res.data[0]
    # 6자리 인증 코드 생성 (15분 유효)
    code = f"{secrets.randbelow(1000000):06d}"
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()

    supabase.table("password_reset_tokens").insert({
        "user_id": user["id"],
        "email": clean_email,
        "reset_code": code,
        "expires_at": expires_at,
        "used": False,
    }).execute()

    # TODO: 실제 운영 시 이메일(SMTP) 발송 연동 위치
    return {
        "message": "비밀번호 초기화 인증 코드가 발급되었습니다. (15분간 유효)",
        "demo_code": code,
    }


@router.post("/password-reset/confirm")
def confirm_password_reset(req: PasswordResetConfirmModel):
    if req.new_password != req.new_password_confirm:
        raise HTTPException(status_code=400, detail="새 비밀번호와 비밀번호 확인이 일치하지 않습니다.")

    clean_email = req.email.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()

    token_res = (
        supabase.table("password_reset_tokens")
        .select("*")
        .eq("email", clean_email)
        .eq("reset_code", req.reset_code.strip())
        .eq("used", False)
        .gte("expires_at", now_iso)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not token_res.data:
        raise HTTPException(status_code=400, detail="인증 코드가 올바르지 않거나 만료되었습니다.")

    token_row = token_res.data[0]

    # 새 비밀번호로 업데이트 및 토큰 사용 처리
    supabase.table("users").update({
        "password_hash": hash_password(req.new_password),
        "updated_at": now_iso,
    }).eq("id", token_row["user_id"]).execute()

    supabase.table("password_reset_tokens").update({"used": True}).eq("id", token_row["id"]).execute()

    return {"message": "비밀번호가 성공적으로 초기화되었습니다. 새 비밀번호로 로그인해 주세요."}