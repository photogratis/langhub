from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.database import supabase
from app.core.config import settings

# auto_error=False 로 설정하여 토큰이 없는 비회원도 에러 없이 None으로 통과시킴
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def get_optional_user(token: Optional[str] = Depends(optional_oauth2_scheme)) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None

    res = supabase.table("users").select("*").eq("id", user_id).execute()
    if not res.data or not res.data[0].get("is_active"):
        return None
    return res.data[0]

def require_module_access(module_id: str):
    """모듈별 동적 접근 권한(PUBLIC / MEMBER / GRADE) 검증 의존성"""
    def _checker(current_user: Optional[dict] = Depends(get_optional_user)) -> Optional[dict]:
        res = supabase.table("system_modules").select("*").eq("module_id", module_id).execute()
        policy = res.data[0] if res.data else {
            "is_enabled": True,
            "access_type": "PUBLIC",
            "allowed_grades": []
        }

        # 1. 관리자(ADMIN)는 모듈 비활성화 상태 테스트 외 모든 권한 통과 가능 (단, OFF 상태면 차단)
        if not policy.get("is_enabled", True):
            raise HTTPException(status_code=403, detail="현재 비활성화된 모듈입니다.")

        access_type = policy.get("access_type", "PUBLIC")
        allowed_grades = policy.get("allowed_grades") or []

        # 2. 비회원 누구나 허용
        if access_type == "PUBLIC":
            return current_user

        # 3. 회원 전체 허용 (비회원 차단)
        if not current_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="로그인이 필요한 서비스입니다.",
            )

        if access_type == "MEMBER":
            return current_user

        # 4. 특정 등급 지정 허용 (ADMIN은 항상 허용)
        if access_type == "GRADE":
            user_grade = current_user.get("grade")
            if user_grade == "ADMIN" or user_grade in allowed_grades:
                return current_user
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"접근 권한이 없습니다. 허용 등급: {', '.join(allowed_grades)}",
            )

        return current_user

    return _checker