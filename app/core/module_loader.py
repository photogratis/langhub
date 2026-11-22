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

    discovered = {}
    for folder in os.listdir(modules_dir):
        manifest_path = os.path.join(modules_dir, folder, "manifest.json")
        if os.path.isfile(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                discovered[folder] = json.load(f)

    for folder, meta in discovered.items():
        deps = meta.get("dependencies", [])
        if not all(dep in discovered for dep in deps):
            print(f"⚠️ [Module Skip] '{folder}': 필수 모듈 {deps} 중 일부가 없어 비활성화됩니다.")
            continue

        LOADED_MANIFESTS[folder] = meta

        # 1. 백엔드 API 라우터 자동 등록
        try:
            router_mod = importlib.import_module(f"app.modules.{folder}.router")
            app.include_router(
                router_mod.router,
                prefix=f"/api/v1/modules/{folder}",
                tags=[f"Module: {meta.get('name', folder)}"],
            )
        except ModuleNotFoundError:
            pass

        # 2. 이벤트 리스너 자동 등록
        try:
            importlib.import_module(f"app.modules.{folder}.events")
        except ModuleNotFoundError:
            pass

        # 3. 모듈 내장 프론트엔드 위젯(ui/) 정적 경로 자동 마운트
        ui_dir = os.path.join(modules_dir, folder, "ui")
        if os.path.isdir(ui_dir):
            app.mount(
                f"/static/modules/{folder}",
                StaticFiles(directory=ui_dir),
                name=f"module_ui_{folder}",
            )

        print(f"✅ [Module Loaded] {meta.get('name')} ({folder})")