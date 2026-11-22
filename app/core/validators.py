import re
from fastapi import HTTPException
from app.core.database import supabase


def validate_and_check_nickname(nickname: str, exclude_user_id: str | None = None) -> str:
    cleaned = nickname.strip()
    if len(cleaned) < 2 or len(cleaned) > 20:
        raise HTTPException(status_code=400, detail="닉네임은 2자 이상 20자 이하로 입력해 주세요.")

    if not re.match(r"^[가-힣a-zA-Z0-9_.-]+$", cleaned):
        raise HTTPException(status_code=400, detail="닉네임은 한글, 영문, 숫자, _, -, . 만 사용할 수 있습니다.")

    # 1. 금지어 사전 검사 (부분 포함 여부까지 체크)
    lower_nick = cleaned.lower()
    forbidden_res = supabase.table("forbidden_nicknames").select("word").execute()
    for row in (forbidden_res.data or []):
        banned = (row.get("word") or "").strip().lower()
        if banned and banned in lower_nick:
            raise HTTPException(
                status_code=400,
                detail=f"'{row['word']}' 단어가 포함된 닉네임은 사용할 수 없습니다."
            )

    # 2. 닉네임 중복 검사 (대소문자 무시)
    dup_query = supabase.table("users").select("id, nickname").ilike("nickname", cleaned)
    dup_res = dup_query.execute()
    for row in (dup_res.data or []):
        if exclude_user_id and str(row["id"]) == str(exclude_user_id):
            continue
        if row["nickname"].strip().lower() == lower_nick:
            raise HTTPException(status_code=400, detail="이미 사용 중인 닉네임입니다.")

    return cleaned