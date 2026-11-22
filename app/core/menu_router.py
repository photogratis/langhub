from fastapi import APIRouter
from app.core.database import supabase
from app.core.module_loader import LOADED_MANIFESTS

router = APIRouter()


@router.get("/menu")
def get_public_modules_menu():
    try:
        res = supabase.table("system_modules").select("*").execute()
        db_policies = {row["module_id"]: row for row in (res.data or [])}
    except Exception:
        db_policies = {}

    menus = []
    for mod_id, meta in LOADED_MANIFESTS.items():
        policy = db_policies.get(mod_id, {"is_enabled": True, "access_type": "PUBLIC"})
        if not policy.get("is_enabled", True):
            continue

        # 관리자가 DB에서 수정한 제목/설명이 있으면 우선 적용, 없으면 manifest.json 기본값 사용
        display_name = (policy.get("custom_name") or "").strip() or meta.get("name", mod_id)
        display_desc = (policy.get("custom_description") or "").strip() or meta.get("description", "")

        menus.append({
            "module_id": mod_id,
            "name": display_name,
            "description": display_desc,
            "type": meta.get("type", "feature"),
            "access_type": policy.get("access_type", "PUBLIC"),
            "ui": meta.get("ui"),
        })

    return menus