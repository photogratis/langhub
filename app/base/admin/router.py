import os
import json
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.database import supabase
from app.base.auth.router import get_current_user
from app.base.auth.schemas import UserResponse
from app.base.admin.schemas import GradeCreateRequest, AdminUserUpdateRequest, ModulePolicyUpdateRequest
from app.core.module_loader import LOADED_MANIFESTS

router = APIRouter()

def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user.get("grade") != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자(ADMIN) 권한이 필요합니다.",
        )
    return current_user

# --- [등급 관리 API] ---
@router.get("/grades")
def list_grades(admin: dict = Depends(require_admin)):
    res = supabase.table("user_grades").select("*").order("level", desc=False).execute()
    return res.data

@router.post("/grades", status_code=status.HTTP_201_CREATED)
def create_grade(req: GradeCreateRequest, admin: dict = Depends(require_admin)):
    code = req.code.strip().upper()
    if not code or not req.name.strip():
        raise HTTPException(status_code=400, detail="등급 코드와 이름을 모두 입력해 주세요.")

    existing = supabase.table("user_grades").select("code").eq("code", code).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"이미 존재하는 등급 코드입니다: {code}")

    res = supabase.table("user_grades").insert({
        "code": code,
        "name": req.name.strip(),
        "description": req.description.strip(),
        "level": req.level,
    }).execute()
    return res.data[0]

@router.delete("/grades/{code}")
def delete_grade(code: str, admin: dict = Depends(require_admin)):
    code = code.upper()
    if code in ("FREE", "ADMIN"):
        raise HTTPException(status_code=400, detail="기본 필수 등급(FREE, ADMIN)은 삭제할 수 없습니다.")

    users_with_grade = supabase.table("users").select("id").eq("grade", code).execute()
    if users_with_grade.data:
        raise HTTPException(status_code=400, detail="이 등급을 보유한 회원이 있어 삭제할 수 없습니다.")

    supabase.table("user_grades").delete().eq("code", code).execute()
    return {"message": f"{code} 등급이 삭제되었습니다."}

# --- [회원 관리 API] ---
@router.get("/users", response_model=List[UserResponse])
def list_all_users(admin: dict = Depends(require_admin)):
    res = supabase.table("users").select("*").order("created_at", desc=True).execute()
    return res.data

@router.patch("/users/{target_user_id}", response_model=UserResponse)
def update_user_by_admin(
    target_user_id: str,
    req: AdminUserUpdateRequest,
    admin: dict = Depends(require_admin),
):
    grade_code = req.grade.strip().upper()
    valid_grade = supabase.table("user_grades").select("code").eq("code", grade_code).execute()
    if not valid_grade.data:
        raise HTTPException(status_code=400, detail=f"존재하지 않는 등급입니다: {grade_code}")

    res = (
        supabase.table("users")
        .update({"grade": grade_code, "is_active": req.is_active})
        .eq("id", target_user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="대상 회원을 찾을 수 없습니다.")
    return res.data[0]

# --- [모듈 관리 API] ---
@router.get("/modules")
def list_modules(admin: dict = Depends(require_admin)):
    modules_dir = os.path.join("app", "modules")
    if not os.path.exists(modules_dir):
        os.makedirs(modules_dir)

    db_res = supabase.table("system_modules").select("*").execute()
    db_states = {row["module_id"]: row for row in db_res.data}

    result = []
    for folder in os.listdir(modules_dir):
        manifest_path = os.path.join(modules_dir, folder, "manifest.json")
        if os.path.isfile(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            policy = db_states.get(folder, {})
            result.append({
                "module_id": folder,
                "name": meta.get("name", folder),
                "version": meta.get("version", "1.0.0"),
                "is_enabled": policy.get("is_enabled", True),
                "access_type": policy.get("access_type", "PUBLIC"),
                "allowed_grades": policy.get("allowed_grades", []),
            })
    return result


class ModulePolicyUpdateRequest(BaseModel):
    is_enabled: bool
    access_type: str
    allowed_grades: List[str] = []
    custom_name: Optional[str] = None
    custom_description: Optional[str] = None


@router.get("/modules")
def list_all_modules_for_admin(admin: dict = Depends(require_admin)):
    res = supabase.table("system_modules").select("*").execute()
    db_map = {row["module_id"]: row for row in (res.data or [])}

    result = []
    for mod_id, meta in LOADED_MANIFESTS.items():
        row = db_map.get(mod_id, {})
        default_name = meta.get("name", mod_id)
        default_desc = meta.get("description", "")

        result.append({
            "module_id": mod_id,
            "default_name": default_name,
            "default_description": default_desc,
            "name": (row.get("custom_name") or "").strip() or default_name,
            "description": (row.get("custom_description") or "").strip() or default_desc,
            "is_enabled": row.get("is_enabled", True),
            "access_type": row.get("access_type", "PUBLIC"),
            "allowed_grades": row.get("allowed_grades") or [],
        })
    return result


@router.patch("/modules/{module_id}")
def update_module_policy(
    module_id: str,
    req: ModulePolicyUpdateRequest,
    admin: dict = Depends(require_admin),
):
    cleaned_grades = [g.strip().upper() for g in req.allowed_grades if g.strip()]
    custom_name = req.custom_name.strip() if req.custom_name else None
    custom_desc = req.custom_description.strip() if req.custom_description else None

    payload = {
        "module_id": module_id,
        "is_enabled": req.is_enabled,
        "access_type": req.access_type,
        "allowed_grades": cleaned_grades,
        "custom_name": custom_name,
        "custom_description": custom_desc,
    }
    try:
        supabase.table("system_modules").upsert(payload).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모듈 설정 저장 실패: {str(e)}")

    return {"message": "모듈 설정이 저장되었습니다."}

class ForbiddenNicknameCreateRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=50)
    reason: str = Field("", max_length=200)


@router.delete("/forbidden-nicknames/{word_id}")
def delete_forbidden_nickname(word_id: str, admin: dict = Depends(require_admin)):
    supabase.table("forbidden_nicknames").delete().eq("id", word_id).execute()
    return {"message": "금지어가 삭제되었습니다."}

@router.get("/forbidden-nicknames")
def list_forbidden_nicknames(admin: dict = Depends(require_admin)):
    try:
        res = supabase.table("forbidden_nicknames").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"금지어 목록 조회 오류: {str(e)}")


@router.post("/forbidden-nicknames")
def add_forbidden_nickname(
    req: ForbiddenNicknameCreateRequest,
    admin: dict = Depends(require_admin),
):
    clean_word = req.word.strip().lower()
    if not clean_word:
        raise HTTPException(status_code=400, detail="금지어를 입력해 주세요.")

    # 1. 실제 중복 여부를 먼저 조회로 확인
    existing = supabase.table("forbidden_nicknames").select("id").eq("word", clean_word).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail=f"'{clean_word}' 단어는 이미 등록된 금지어입니다.")

    # 2. 등록 실행 (DB/테이블 에러 발생 시 실제 원인을 그대로 반환)
    try:
        res = supabase.table("forbidden_nicknames").insert({
            "word": clean_word,
            "reason": req.reason.strip(),
        }).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {str(e)}")

    if not res.data:
        raise HTTPException(status_code=500, detail="금지어 등록에 실패했습니다.")

    return res.data[0]