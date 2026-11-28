import os
import json
import importlib
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

LOADED_MANIFESTS = {}


def load_all_modules(app: FastAPI):
    modules_dir = os.path.join("app", "modules")
    if not os.path.exists(modules_dir):
        os.makedirs(modules_dir)
        return

    for folder_name in sorted(os.listdir(modules_dir)):
        mod_path = os.path.join(modules_dir, folder_name)
        if not os.path.isdir(mod_path):
            continue

        manifest_file = os.path.join(mod_path, "manifest.json")
        if not os.path.isfile(manifest_file):
            continue

        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        base_module_id = manifest.get("module_id", folder_name)
        api_prefix = manifest.get("api_prefix", f"/api/v1/modules/{base_module_id}")

        # 1. API 라우터 로드 (모듈 폴더 기준 1회)
        router_file = os.path.join(mod_path, "router.py")
        if os.path.isfile(router_file):
            mod_import = importlib.import_module(f"app.modules.{folder_name}.router")
            if hasattr(mod_import, "router"):
                app.include_router(
                    mod_import.router,
                    prefix=api_prefix,
                    tags=[manifest.get("name", base_module_id)],
                )

        # 2. 정적 UI 경로 마운트 (/static/modules/{folder_name})
        ui_dir = os.path.join(mod_path, "ui")
        if os.path.isdir(ui_dir):
            app.mount(
                f"/static/modules/{folder_name}",
                StaticFiles(directory=ui_dir),
                name=f"mod_ui_{folder_name}",
            )

        # 3. 다중 메뉴("menus") 지원 + 단일 메뉴 하위 호환
        sub_menus = manifest.get("menus")
        if isinstance(sub_menus, list) and sub_menus:
            for item in sub_menus:
                sub_id = item.get("module_id")
                if not sub_id:
                    continue
                ui_cfg = dict(item.get("ui") or {})
                ui_cfg.setdefault("asset_module", folder_name)

                LOADED_MANIFESTS[sub_id] = {
                    "module_id": sub_id,
                    "parent_module_id": base_module_id,
                    "name": item.get("name", sub_id),
                    "description": item.get("description", ""),
                    "name_id": item.get("name_id", item.get("name", sub_id)),
                    "description_id": item.get("description_id", item.get("description", "")),
                    "type": item.get("type", manifest.get("type", "feature")),
                    "default_enabled": item.get("default_enabled", manifest.get("default_enabled", True)),
                    "default_access_type": item.get("default_access_type", manifest.get("default_access_type", "PUBLIC")),
                    "default_allowed_grades": item.get("default_allowed_grades", manifest.get("default_allowed_grades", [])),
                    "ui": ui_cfg,
                }
        else:
            ui_cfg = dict(manifest.get("ui") or {})
            if ui_cfg:
                ui_cfg.setdefault("asset_module", folder_name)
            LOADED_MANIFESTS[base_module_id] = {
                **manifest,
                "ui": ui_cfg or None,
            }