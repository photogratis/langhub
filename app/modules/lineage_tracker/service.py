from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from fastapi import HTTPException
from app.core.database import supabase


def parse_iso_dt(dt_str: Optional[str]) -> datetime:
    if not dt_str:
        return datetime.now(timezone.utc)
    cleaned = dt_str.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def get_items_price_map() -> Dict[str, dict]:
    res = supabase.table("lineage_items").select("*").execute()
    return {str(row["id"]): row for row in (res.data or [])}


def get_storage_qty(
    storage_type: str,
    item_id: str,
    character_id: Optional[str] = None,
    clan_id: Optional[str] = None,
) -> Tuple[Optional[str], int]:
    query = (
        supabase.table("lineage_inventories")
        .select("id, quantity")
        .eq("storage_type", storage_type)
        .eq("item_id", item_id)
    )
    if storage_type in ("CHARACTER", "PERSONAL"):
        query = query.eq("character_id", character_id)
    else:
        query = query.eq("clan_id", clan_id)
    res = query.execute()
    if res.data:
        return str(res.data[0]["id"]), int(res.data[0]["quantity"] or 0)
    return None, 0


def set_storage_qty(
    storage_type: str,
    item_id: str,
    new_qty: int,
    character_id: Optional[str] = None,
    clan_id: Optional[str] = None,
) -> None:
    row_id, _ = get_storage_qty(storage_type, item_id, character_id, clan_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    if row_id:
        supabase.table("lineage_inventories").update(
            {"quantity": max(0, int(new_qty)), "updated_at": now_iso}
        ).eq("id", row_id).execute()
    else:
        payload = {
            "storage_type": storage_type,
            "character_id": character_id if storage_type in ("CHARACTER", "PERSONAL") else None,
            "clan_id": clan_id if storage_type == "CLAN" else None,
            "item_id": item_id,
            "quantity": max(0, int(new_qty)),
            "updated_at": now_iso,
        }
        supabase.table("lineage_inventories").insert(payload).execute()


def apply_item_transaction(
    user: dict,
    character_id: str,
    clan_id: Optional[str],
    session_id: Optional[str],
    tx_type: str,
    item_id: str,
    quantity: int,
    sale_total_adena: Optional[float],
    note: str,
) -> dict:
    item_map = get_items_price_map()
    item_info = item_map.get(str(item_id))
    if not item_info:
        raise HTTPException(status_code=404, detail="등록되지 않은 아이템입니다.")

    unit_price = float(item_info.get("adena_unit_price") or 0)
    adena_val = (
        float(sale_total_adena)
        if (tx_type == "SELL" and sale_total_adena is not None)
        else round(unit_price * quantity, 2)
    )

    # 현재 캐릭터 인벤토리 및 창고 재고 확인/갱신
    _, char_qty = get_storage_qty("CHARACTER", item_id, character_id=character_id)

    if tx_type == "TO_PERSONAL":
        if char_qty < quantity:
            raise HTTPException(status_code=400, detail=f"캐릭터 보유 수량({char_qty})이 부족합니다.")
        _, p_qty = get_storage_qty("PERSONAL", item_id, character_id=character_id)
        set_storage_qty("CHARACTER", item_id, char_qty - quantity, character_id=character_id)
        set_storage_qty("PERSONAL", item_id, p_qty + quantity, character_id=character_id)

    elif tx_type == "FROM_PERSONAL":
        _, p_qty = get_storage_qty("PERSONAL", item_id, character_id=character_id)
        if p_qty < quantity:
            raise HTTPException(status_code=400, detail=f"개인창고 수량({p_qty})이 부족합니다.")
        set_storage_qty("PERSONAL", item_id, p_qty - quantity, character_id=character_id)
        set_storage_qty("CHARACTER", item_id, char_qty + quantity, character_id=character_id)

    elif tx_type == "TO_CLAN":
        if not clan_id:
            raise HTTPException(status_code=400, detail="혈맹을 선택해 주세요.")
        if char_qty < quantity:
            raise HTTPException(status_code=400, detail=f"캐릭터 보유 수량({char_qty})이 부족합니다.")
        _, c_qty = get_storage_qty("CLAN", item_id, clan_id=clan_id)
        set_storage_qty("CHARACTER", item_id, char_qty - quantity, character_id=character_id)
        set_storage_qty("CLAN", item_id, c_qty + quantity, clan_id=clan_id)

    elif tx_type == "FROM_CLAN":
        if not clan_id:
            raise HTTPException(status_code=400, detail="혈맹을 선택해 주세요.")
        _, c_qty = get_storage_qty("CLAN", item_id, clan_id=clan_id)
        if c_qty < quantity:
            raise HTTPException(status_code=400, detail=f"혈맹창고 수량({c_qty})이 부족합니다.")
        set_storage_qty("CLAN", item_id, c_qty - quantity, clan_id=clan_id)
        set_storage_qty("CHARACTER", item_id, char_qty + quantity, character_id=character_id)

    elif tx_type in ("SELL", "TRADE_OUT"):
        if char_qty < quantity:
            raise HTTPException(status_code=400, detail=f"캐릭터 보유 수량({char_qty})이 부족합니다.")
        set_storage_qty("CHARACTER", item_id, char_qty - quantity, character_id=character_id)

        # 판매(SELL)인 경우 판매 대금만큼 '아데나' 재고 자동 증가
        if tx_type == "SELL" and adena_val > 0:
            adena_item = next(
                (v for v in item_map.values() if v["item_name"] == "아데나"), None
            )
            if adena_item:
                _, cur_adena = get_storage_qty(
                    "CHARACTER", str(adena_item["id"]), character_id=character_id
                )
                set_storage_qty(
                    "CHARACTER",
                    str(adena_item["id"]),
                    cur_adena + int(round(adena_val)),
                    character_id=character_id,
                )
    else:
        raise HTTPException(status_code=400, detail="지원하지 않는 거래/이동 유형입니다.")

    tx_payload = {
        "session_id": session_id,
        "user_id": str(user["id"]),
        "user_nickname": user.get("nickname", "작업자"),
        "character_id": character_id,
        "clan_id": clan_id,
        "tx_type": tx_type,
        "item_id": item_id,
        "quantity": quantity,
        "adena_value": adena_val,
        "note": note.strip(),
    }
    ins = supabase.table("lineage_item_transactions").insert(tx_payload).execute()
    return ins.data[0] if ins.data else tx_payload


def finalize_play_session(
    session_row: dict,
    ended_at_str: Optional[str],
    end_level: int,
    end_exp: float,
    end_items_raw: List[dict],
) -> dict:
    item_map = get_items_price_map()
    start_dt = parse_iso_dt(session_row["started_at"])
    end_dt = parse_iso_dt(ended_at_str)
    if end_dt <= start_dt:
        raise HTTPException(status_code=400, detail="종료 시간은 시작 시간보다 이후여야 합니다.")

    duration_minutes = max(1, int(round((end_dt - start_dt).total_seconds() / 60)))

    # 시작 아이템 맵
    start_qty_map: Dict[str, int] = {}
    for it in session_row.get("start_items") or []:
        iid = str(it["item_id"])
        start_qty_map[iid] = start_qty_map.get(iid, 0) + int(it.get("quantity") or 0)

    # 종료 아이템 정리 및 가치 합산
    end_items_enriched = []
    end_qty_map: Dict[str, int] = {}
    for it in end_items_raw:
        iid = str(it["item_id"])
        qty = int(it["quantity"])
        end_qty_map[iid] = end_qty_map.get(iid, 0) + qty
        meta = item_map.get(iid, {})
        end_items_enriched.append({
            "item_id": iid,
            "item_name": meta.get("item_name", "알 수 없음"),
            "quantity": qty,
            "adena_unit_price": float(meta.get("adena_unit_price") or 0),
        })

    # 해당 세션 중 발생한 창고 입출고/판매 내역 조회
    tx_res = (
        supabase.table("lineage_item_transactions")
        .select("*")
        .eq("session_id", str(session_row["id"]))
        .execute()
    )
    tx_list = tx_res.data or []

    # 순수익 아데나 계산:
    # (종료 인벤토리 아데나 가치 - 시작 인벤토리 아데나 가치)
    # + 창고로 보낸 아이템 가치(TO_PERSONAL, TO_CLAN) + 외부 이전(TRADE_OUT)
    # - 창고에서 꺼낸 아이템 가치(FROM_PERSONAL, FROM_CLAN)
    # (참고: SELL은 아이템이 빠지고 아데나가 인벤토리에 들어오므로 인벤토리 순변화에 자동 반영됨)
    start_total_adena = sum(
        qty * float(item_map.get(iid, {}).get("adena_unit_price") or 0)
        for iid, qty in start_qty_map.items()
    )
    end_total_adena = sum(
        qty * float(item_map.get(iid, {}).get("adena_unit_price") or 0)
        for iid, qty in end_qty_map.items()
    )

    warehouse_net_adena = 0.0
    discrepancy_reasons = []

    # 수량 정합성 검증 (비소모성/고급 아이템 또는 아데나 외 아이템의 비정상 감소 체크)
    tx_delta_by_item: Dict[str, int] = {}
    for tx in tx_list:
        iid = str(tx["item_id"])
        q = int(tx["quantity"])
        ttype = tx["tx_type"]
        val = float(tx.get("adena_value") or 0)

        if ttype in ("TO_PERSONAL", "TO_CLAN", "TRADE_OUT"):
            warehouse_net_adena += val
            tx_delta_by_item[iid] = tx_delta_by_item.get(iid, 0) - q
        elif ttype in ("FROM_PERSONAL", "FROM_CLAN"):
            warehouse_net_adena -= val
            tx_delta_by_item[iid] = tx_delta_by_item.get(iid, 0) + q
        elif ttype == "SELL":
            tx_delta_by_item[iid] = tx_delta_by_item.get(iid, 0) - q

    all_item_ids = set(start_qty_map.keys()) | set(end_qty_map.keys()) | set(tx_delta_by_item.keys())
    for iid in all_item_ids:
        meta = item_map.get(iid, {})
        iname = meta.get("item_name", iid)
        if iname == "아데나":
            continue
        expected_min = start_qty_map.get(iid, 0) + tx_delta_by_item.get(iid, 0)
        actual_end = end_qty_map.get(iid, 0)
        if actual_end < expected_min:
            discrepancy_reasons.append(
                f"{iname}: 예상 최소 {expected_min}개 vs 종료 입력 {actual_end}개 (차이 {actual_end - expected_min})"
            )

    net_earned_adena = round((end_total_adena - start_total_adena) + warehouse_net_adena, 2)
    hourly_earned_adena = round(net_earned_adena / (duration_minutes / 60.0), 2)

    has_discrepancy = len(discrepancy_reasons) > 0
    discrepancy_note = " / ".join(discrepancy_reasons)

    # 종료 시점 스냅샷을 캐릭터 인벤토리 및 캐릭터 레벨/경험치에 반영
    char_id = str(session_row["character_id"])
    for iid in all_item_ids:
        set_storage_qty("CHARACTER", iid, end_qty_map.get(iid, 0), character_id=char_id)

    supabase.table("lineage_characters").update(
        {"current_level": end_level, "current_exp": end_exp}
    ).eq("id", char_id).execute()

    update_payload = {
        "ended_at": end_dt.isoformat(),
        "end_level": end_level,
        "end_exp": end_exp,
        "end_items": end_items_enriched,
        "duration_minutes": duration_minutes,
        "net_earned_adena": net_earned_adena,
        "hourly_earned_adena": hourly_earned_adena,
        "has_discrepancy": has_discrepancy,
        "discrepancy_note": discrepancy_note,
        "status": "DISCREPANCY" if has_discrepancy else "COMPLETED",
    }
    upd = (
        supabase.table("lineage_play_sessions")
        .update(update_payload)
        .eq("id", str(session_row["id"]))
        .execute()
    )
    return upd.data[0]