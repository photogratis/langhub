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
        default_enabled = meta.get("default_enabled", True)
        default_access = meta.get("default_access_type", "PUBLIC")
        policy = db_policies.get(
            mod_id,
            {"is_enabled": default_enabled, "access_type": default_access},
        )
        if not policy.get("is_enabled", default_enabled):
            continue

        # 한국어 표시 문구 (DB 수정값 우선 -> manifest.json 기본값)
        display_name = (policy.get("custom_name") or "").strip() or meta.get("name", mod_id)
        display_desc = (policy.get("custom_description") or "").strip() or meta.get("description", "")

        # 인도네시아어 표시 문구 (DB 수정값 우선 -> manifest.json name_id -> 한국어 fallback)
        display_name_id = (
            (policy.get("custom_name_id") or "").strip()
            or (meta.get("name_id") or "").strip()
            or display_name
        )
        display_desc_id = (
            (policy.get("custom_description_id") or "").strip()
            or (meta.get("description_id") or "").strip()
            or display_desc
        )

        menus.append({
            "module_id": mod_id,
            "name": display_name,
            "description": display_desc,
            "name_id": display_name_id,
            "description_id": display_desc_id,
            "type": meta.get("type", "feature"),
            "access_type": policy.get("access_type", default_access),
            "ui": meta.get("ui"),
        })

    return menus