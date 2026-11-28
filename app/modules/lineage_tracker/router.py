from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import supabase
from app.core.module_guard import require_module_access
from app.base.auth.dependencies import get_current_user
from app.modules.lineage_tracker.schemas import (
    AccountUpsert,
    AdminInventoryAdjustRequest,
    CharacterUpsert,
    ClanUpsert,
    ItemTransactionCreate,
    ItemUpsert,
    PayoutCreateRequest,
    ServerUpsert,
    SessionEndRequest,
    SessionStartRequest,
)
from app.modules.lineage_tracker.service import (
    apply_item_transaction,
    finalize_play_session,
    get_items_price_map,
    get_storage_qty,
    parse_iso_dt,
    set_storage_qty,
)

router = APIRouter()


def require_lineage_member(
    user: Optional[dict] = Depends(require_module_access("lineage_tracker")),
) -> dict:
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    grade = str(user.get("grade") or "").strip().upper()
    if grade not in ("LINEAGE", "LINEAGE_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="LINEAGE 등급 전용 모듈입니다.")
    return user


def require_lineage_admin(current_user: dict = Depends(get_current_user)) -> dict:
    grade = str(current_user.get("grade") or "").strip().upper()
    if grade not in ("LINEAGE_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="LINEAGE_ADMIN 관리자 권한이 필요합니다.")
    return current_user


# =========================================================
# 1. 마스터 데이터 통합 조회 (서버 / 혈맹 / 계정 / 캐릭터 / 아이템)
# =========================================================
@router.get("/bootstrap")
def get_lineage_bootstrap(user: dict = Depends(require_lineage_member)):
    servers = (
        supabase.table("lineage_servers")
        .select("*")
        .eq("is_active", True)
        .order("server_name")
        .execute()
        .data
        or []
    )
    clans = (
        supabase.table("lineage_clans")
        .select("*")
        .eq("is_active", True)
        .order("clan_name")
        .execute()
        .data
        or []
    )
    accounts = (
        supabase.table("lineage_accounts")
        .select("*")
        .eq("is_active", True)
        .order("account_name")
        .execute()
        .data
        or []
    )
    chars = (
        supabase.table("lineage_characters")
        .select(
            "*, lineage_servers(id, server_name), lineage_accounts(id, account_name), lineage_clans(id, clan_name)"
        )
        .eq("is_active", True)
        .order("character_name")
        .execute()
        .data
        or []
    )
    items = (
        supabase.table("lineage_items")
        .select("*")
        .order("category")
        .order("item_name")
        .execute()
        .data
        or []
    )
    grade = str(user.get("grade") or "").strip().upper()
    return {
        "is_lineage_admin": grade in ("LINEAGE_ADMIN", "ADMIN"),
        "servers": servers,
        "clans": clans,
        "accounts": accounts,
        "characters": chars,
        "items": items,
    }


# --- [서버 CRUD] ---
@router.post("/servers")
def create_server(req: ServerUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"server_name": req.server_name.strip(), "description": req.description.strip()}
    try:
        res = supabase.table("lineage_servers").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"서버 등록 실패 (중복 여부 확인): {str(e)}")


@router.patch("/servers/{server_id}")
def update_server(server_id: str, req: ServerUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"server_name": req.server_name.strip(), "description": req.description.strip()}
    res = supabase.table("lineage_servers").update(payload).eq("id", server_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="서버를 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/servers/{server_id}")
def delete_server(server_id: str, admin: dict = Depends(require_lineage_admin)):
    linked = supabase.table("lineage_characters").select("id").eq("server_id", server_id).limit(1).execute().data
    if linked:
        raise HTTPException(status_code=400, detail="이 서버에 소속된 캐릭터가 있어 삭제할 수 없습니다.")
    supabase.table("lineage_servers").delete().eq("id", server_id).execute()
    return {"message": "서버가 삭제되었습니다."}


# --- [혈맹 CRUD (독립 목록)] ---
@router.post("/clans")
def create_clan(req: ClanUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"clan_name": req.clan_name.strip(), "description": req.description.strip()}
    try:
        res = supabase.table("lineage_clans").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"혈맹 등록 실패 (중복 여부 확인): {str(e)}")


@router.patch("/clans/{clan_id}")
def update_clan(clan_id: str, req: ClanUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"clan_name": req.clan_name.strip(), "description": req.description.strip()}
    res = supabase.table("lineage_clans").update(payload).eq("id", clan_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="혈맹을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/clans/{clan_id}")
def delete_clan(clan_id: str, admin: dict = Depends(require_lineage_admin)):
    # 캐릭터의 clan_id는 ON DELETE SET NULL 로 자동 해제됨
    supabase.table("lineage_clans").delete().eq("id", clan_id).execute()
    return {"message": "혈맹이 삭제되었습니다."}


# --- [게임 계정 CRUD (서버 비의존 독립 목록)] ---
@router.post("/accounts")
def create_account(req: AccountUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"account_name": req.account_name.strip(), "memo": req.memo.strip()}
    try:
        res = supabase.table("lineage_accounts").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"계정 등록 실패 (중복 여부 확인): {str(e)}")


@router.patch("/accounts/{account_id}")
def update_account(account_id: str, req: AccountUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {"account_name": req.account_name.strip(), "memo": req.memo.strip()}
    res = supabase.table("lineage_accounts").update(payload).eq("id", account_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="계정을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str, admin: dict = Depends(require_lineage_admin)):
    linked = supabase.table("lineage_characters").select("id").eq("account_id", account_id).limit(1).execute().data
    if linked:
        raise HTTPException(status_code=400, detail="이 계정에 소속된 캐릭터가 있어 삭제할 수 없습니다.")
    supabase.table("lineage_accounts").delete().eq("id", account_id).execute()
    return {"message": "계정이 삭제되었습니다."}


# --- [캐릭터 CRUD (서버 + 계정 연결, 혈맹 선택, 레벨 입력 없음)] ---
@router.post("/characters")
def create_character(req: CharacterUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {
        "server_id": req.server_id,
        "account_id": req.account_id,
        "clan_id": (req.clan_id or "").strip() or None,
        "character_name": req.character_name.strip(),
    }
    try:
        res = supabase.table("lineage_characters").insert(payload).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"캐릭터 등록 실패: {str(e)}")


@router.patch("/characters/{character_id}")
def update_character(
    character_id: str, req: CharacterUpsert, admin: dict = Depends(require_lineage_admin)
):
    payload = {
        "server_id": req.server_id,
        "account_id": req.account_id,
        "clan_id": (req.clan_id or "").strip() or None,
        "character_name": req.character_name.strip(),
    }
    res = supabase.table("lineage_characters").update(payload).eq("id", character_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="캐릭터를 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/characters/{character_id}")
def delete_character(character_id: str, admin: dict = Depends(require_lineage_admin)):
    supabase.table("lineage_characters").delete().eq("id", character_id).execute()
    return {"message": "캐릭터가 삭제되었습니다."}


# --- [아이템 단가 CRUD] ---
@router.post("/items")
def upsert_item_price(req: ItemUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {
        "item_name": req.item_name.strip(),
        "adena_unit_price": req.adena_unit_price,
        "category": req.category.strip() or "기타",
    }
    res = (
        supabase.table("lineage_items")
        .upsert(payload, on_conflict="item_name")
        .execute()
    )
    return res.data[0]


@router.patch("/items/{item_id}")
def update_item_price(item_id: str, req: ItemUpsert, admin: dict = Depends(require_lineage_admin)):
    payload = {
        "item_name": req.item_name.strip(),
        "adena_unit_price": req.adena_unit_price,
        "category": req.category.strip() or "기타",
    }
    res = supabase.table("lineage_items").update(payload).eq("id", item_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="아이템을 찾을 수 없습니다.")
    return res.data[0]


@router.delete("/items/{item_id}")
def delete_item_price(item_id: str, admin: dict = Depends(require_lineage_admin)):
    existing = supabase.table("lineage_items").select("item_name").eq("id", item_id).execute().data
    if existing and existing[0].get("item_name") == "아데나":
        raise HTTPException(status_code=400, detail="기본 재화 '아데나'는 삭제할 수 없습니다.")
    supabase.table("lineage_items").delete().eq("id", item_id).execute()
    return {"message": "아이템이 삭제되었습니다."}


# =========================================================
# 2. 인벤토리 및 개인/혈맹 창고 현황 조회
# =========================================================
@router.get("/inventories")
def list_inventories(
    character_id: Optional[str] = Query(None),
    clan_id: Optional[str] = Query(None),
    user: dict = Depends(require_lineage_member),
):
    query = supabase.table("lineage_inventories").select(
        "*, lineage_items(item_name, adena_unit_price, category), lineage_characters(character_name), lineage_clans(clan_name)"
    )
    res = query.execute().data or []

    filtered = []
    for row in res:
        stype = row.get("storage_type")
        if stype in ("CHARACTER", "PERSONAL") and character_id:
            if str(row.get("character_id")) != str(character_id):
                continue
        if stype == "CLAN" and clan_id:
            if str(row.get("clan_id")) != str(clan_id):
                continue
        filtered.append(row)
    return filtered


# =========================================================
# 3. 일일 게임 세션 시작 / 종료 & 내 기록
# =========================================================
@router.get("/sessions/active")
def get_my_active_session(user: dict = Depends(require_lineage_member)):
    res = (
        supabase.table("lineage_play_sessions")
        .select(
            "*, lineage_characters(character_name, clan_id, lineage_servers(server_name), lineage_accounts(account_name))"
        )
        .eq("user_id", str(user["id"]))
        .eq("status", "PLAYING")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("/sessions/start")
def start_play_session(req: SessionStartRequest, user: dict = Depends(require_lineage_member)):
    existing = (
        supabase.table("lineage_play_sessions")
        .select("id")
        .eq("user_id", str(user["id"]))
        .eq("status", "PLAYING")
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=400, detail="이미 진행 중인 게임 세션이 있습니다. 먼저 종료 기록을 저장해 주세요.")

    item_map = get_items_price_map()
    start_dt = parse_iso_dt(req.started_at)

    enriched_items = []
    for it in req.start_items:
        meta = item_map.get(str(it.item_id), {})
        enriched_items.append({
            "item_id": str(it.item_id),
            "item_name": meta.get("item_name", "알 수 없음"),
            "quantity": int(it.quantity),
            "adena_unit_price": float(meta.get("adena_unit_price") or 0),
        })
        set_storage_qty("CHARACTER", str(it.item_id), int(it.quantity), character_id=req.character_id)

    supabase.table("lineage_characters").update(
        {"current_level": req.start_level, "current_exp": req.start_exp}
    ).eq("id", req.character_id).execute()

    payload = {
        "user_id": str(user["id"]),
        "user_nickname": user.get("nickname", "작업자"),
        "character_id": req.character_id,
        "started_at": start_dt.isoformat(),
        "start_level": req.start_level,
        "start_exp": req.start_exp,
        "start_items": enriched_items,
        "status": "PLAYING",
    }
    ins = supabase.table("lineage_play_sessions").insert(payload).execute()
    return ins.data[0]


@router.post("/sessions/{session_id}/end")
def end_play_session(
    session_id: str,
    req: SessionEndRequest,
    user: dict = Depends(require_lineage_member),
):
    res = (
        supabase.table("lineage_play_sessions")
        .select("*")
        .eq("id", session_id)
        .execute()
        .data
    )
    if not res:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    session_row = res[0]
    grade = str(user.get("grade") or "").strip().upper()
    if str(session_row["user_id"]) != str(user["id"]) and grade not in ("LINEAGE_ADMIN", "ADMIN"):
        raise HTTPException(status_code=403, detail="본인의 게임 세션만 종료할 수 있습니다.")

    if session_row["status"] != "PLAYING":
        raise HTTPException(status_code=400, detail="이미 종료된 세션입니다.")

    return finalize_play_session(
        session_row=session_row,
        ended_at_str=req.ended_at,
        end_level=req.end_level,
        end_exp=req.end_exp,
        end_items_raw=[it.model_dump() for it in req.end_items],
    )


@router.get("/sessions")
def list_play_sessions(
    only_mine: bool = Query(False),
    worker_user_id: Optional[str] = Query(None),
    user: dict = Depends(require_lineage_member),
):
    grade = str(user.get("grade") or "").strip().upper()
    is_admin = grade in ("LINEAGE_ADMIN", "ADMIN")

    query = supabase.table("lineage_play_sessions").select(
        "*, lineage_characters(character_name, lineage_servers(server_name), lineage_accounts(account_name), lineage_clans(clan_name))"
    ).order("started_at", desc=True)

    if not is_admin or only_mine:
        query = query.eq("user_id", str(user["id"]))
    elif worker_user_id:
        query = query.eq("user_id", worker_user_id)

    return query.limit(100).execute().data or []


# =========================================================
# 4. 창고 입출고(개인/혈맹) 및 아이템 판매/이전 원장
# =========================================================
@router.post("/transactions")
def create_item_transaction(
    req: ItemTransactionCreate,
    user: dict = Depends(require_lineage_member),
):
    return apply_item_transaction(
        user=user,
        character_id=req.character_id,
        clan_id=req.clan_id,
        session_id=req.session_id,
        tx_type=req.tx_type,
        item_id=req.item_id,
        quantity=req.quantity,
        sale_total_adena=req.sale_total_adena,
        note=req.note,
    )


@router.get("/transactions")
def list_item_transactions(user: dict = Depends(require_lineage_member)):
    res = (
        supabase.table("lineage_item_transactions")
        .select(
            "*, lineage_items(item_name), lineage_characters(character_name), lineage_clans(clan_name)"
        )
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


# =========================================================
# 5. LINEAGE_ADMIN 전용 재고 수량 보정 및 감사 로그
# =========================================================
@router.post("/admin/adjust-inventory")
def admin_adjust_inventory(
    req: AdminInventoryAdjustRequest,
    admin: dict = Depends(require_lineage_admin),
):
    stype = req.storage_type.upper()
    if stype not in ("CHARACTER", "PERSONAL", "CLAN"):
        raise HTTPException(status_code=400, detail="유효하지 않은 창고 구분입니다.")
    if stype in ("CHARACTER", "PERSONAL") and not req.character_id:
        raise HTTPException(status_code=400, detail="대상 캐릭터를 선택해 주세요.")
    if stype == "CLAN" and not req.clan_id:
        raise HTTPException(status_code=400, detail="대상 혈맹을 선택해 주세요.")

    _, before_qty = get_storage_qty(
        stype, req.item_id, character_id=req.character_id, clan_id=req.clan_id
    )
    after_qty = int(req.after_qty)
    diff_qty = after_qty - before_qty

    set_storage_qty(
        stype, req.item_id, after_qty, character_id=req.character_id, clan_id=req.clan_id
    )

    log_payload = {
        "storage_type": stype,
        "character_id": req.character_id if stype in ("CHARACTER", "PERSONAL") else None,
        "clan_id": req.clan_id if stype == "CLAN" else None,
        "item_id": req.item_id,
        "before_qty": before_qty,
        "after_qty": after_qty,
        "diff_qty": diff_qty,
        "reason": req.reason.strip(),
        "admin_user_id": str(admin["id"]),
        "admin_nickname": admin.get("nickname", "관리자"),
    }
    ins = supabase.table("lineage_inventory_adjustments").insert(log_payload).execute()
    return ins.data[0]


@router.get("/admin/adjustments")
def list_inventory_adjustments(user: dict = Depends(require_lineage_member)):
    res = (
        supabase.table("lineage_inventory_adjustments")
        .select(
            "*, lineage_items(item_name), lineage_characters(character_name), lineage_clans(clan_name)"
        )
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return res.data or []


# =========================================================
# 6. 게이머별 시간당 획득 아데나 통계 & 인도네시아 루피아(IDR) 급여 정산
# =========================================================
@router.get("/payouts/summary")
def get_worker_adena_summary(
    period_start: str = Query(..., description="YYYY-MM-DD"),
    period_end: str = Query(..., description="YYYY-MM-DD"),
    admin: dict = Depends(require_lineage_admin),
):
    sessions = (
        supabase.table("lineage_play_sessions")
        .select("*")
        .neq("status", "PLAYING")
        .gte("started_at", f"{period_start}T00:00:00+00:00")
        .lte("started_at", f"{period_end}T23:59:59+00:00")
        .execute()
        .data
        or []
    )

    by_worker = {}
    for s in sessions:
        uid = str(s["user_id"])
        if uid not in by_worker:
            by_worker[uid] = {
                "worker_user_id": uid,
                "worker_nickname": s.get("user_nickname", "작업자"),
                "session_count": 0,
                "total_play_minutes": 0,
                "total_earned_adena": 0.0,
                "discrepancy_count": 0,
            }
        w = by_worker[uid]
        w["session_count"] += 1
        w["total_play_minutes"] += int(s.get("duration_minutes") or 0)
        w["total_earned_adena"] += float(s.get("net_earned_adena") or 0)
        if s.get("has_discrepancy"):
            w["discrepancy_count"] += 1

    result = []
    for w in by_worker.values():
        hours = w["total_play_minutes"] / 60.0 if w["total_play_minutes"] > 0 else 0
        w["total_play_hours"] = round(hours, 2)
        w["avg_hourly_adena"] = round(w["total_earned_adena"] / hours, 2) if hours > 0 else 0.0
        result.append(w)

    result.sort(key=lambda x: x["avg_hourly_adena"], reverse=True)
    return result


@router.post("/payouts")
def create_idr_payout(
    req: PayoutCreateRequest,
    admin: dict = Depends(require_lineage_admin),
):
    hours = req.total_play_minutes / 60.0 if req.total_play_minutes > 0 else 0.0
    total_paid_idr = round((hours * req.hourly_rate_idr) + req.bonus_idr, 2)

    payload = {
        "worker_user_id": req.worker_user_id,
        "worker_nickname": req.worker_nickname,
        "period_start": req.period_start,
        "period_end": req.period_end,
        "total_play_minutes": req.total_play_minutes,
        "total_earned_adena": req.total_earned_adena,
        "avg_hourly_adena": req.avg_hourly_adena,
        "hourly_rate_idr": req.hourly_rate_idr,
        "bonus_idr": req.bonus_idr,
        "total_paid_idr": total_paid_idr,
        "payment_method": req.payment_method,
        "payment_note": req.payment_note.strip(),
        "paid_by_admin_id": str(admin["id"]),
        "paid_by_admin_name": admin.get("nickname", "관리자"),
    }
    ins = supabase.table("lineage_payouts").insert(payload).execute()
    return ins.data[0]


@router.get("/payouts")
def list_idr_payouts(user: dict = Depends(require_lineage_member)):
    grade = str(user.get("grade") or "").strip().upper()
    is_admin = grade in ("LINEAGE_ADMIN", "ADMIN")

    query = supabase.table("lineage_payouts").select("*").order("paid_at", desc=True)
    if not is_admin:
        query = query.eq("worker_user_id", str(user["id"]))

    return query.limit(100).execute().data or []