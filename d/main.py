import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.core.module_loader import load_all_modules
from app.core.menu_router import router as menu_router
from app.base.auth.router import router as auth_router
from app.base.users.router import router as users_router
from app.base.admin.router import router as admin_router

app = FastAPI(title="LangHuv")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. 기본 코어 API 라우터 등록
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])

# 2. 확장 모듈 자동 로드 (/static/modules/{모듈명} 경로 포함)
load_all_modules(app)

# 3. 동적 메뉴 API 등록
app.include_router(menu_router, prefix="/api/v1/modules", tags=["Modules Menu"])

# 4. 코어 기본 기능(auth, admin) 내장 UI 마운트
for base_pkg in ["auth", "admin"]:
    ui_path = os.path.join("app", "base", base_pkg, "ui")
    if os.path.isdir(ui_path):
        app.mount(f"/static/base/{base_pkg}", StaticFiles(directory=ui_path), name=f"base_ui_{base_pkg}")

# 5. 공통 쉘 정적 파일 마운트 (항상 마지막에 위치)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def read_index():
    return FileResponse("static/index.html")