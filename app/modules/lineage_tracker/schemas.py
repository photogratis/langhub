from pydantic import BaseModel, Field
from typing import List, Optional


# 1. 서버 마스터 (독립)
class ServerUpsert(BaseModel):
    server_name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=300)


# 2. 혈맹 마스터 (독립, 선택적 연결용)
class ClanUpsert(BaseModel):
    clan_name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=300)


# 3. 게임 계정 마스터 (독립)
class AccountUpsert(BaseModel):
    account_name: str = Field(..., min_length=1, max_length=100)
    memo: str = Field("", max_length=300)


# 4. 캐릭터 마스터 (서버 + 계정 필수, 혈맹 선택, 레벨 입력 제거)
class CharacterUpsert(BaseModel):
    server_id: str = Field(..., min_length=1)
    account_id: str = Field(..., min_length=1)
    clan_id: Optional[str] = None
    character_name: str = Field(..., min_length=1, max_length=100)


# 5. 아이템 단가 마스터
class ItemUpsert(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=150)
    adena_unit_price: float = Field(..., ge=0)
    category: str = Field("기타", max_length=50)


class InventoryItemInput(BaseModel):
    item_id: str
    quantity: int = Field(..., ge=0)


class SessionStartRequest(BaseModel):
    character_id: str
    started_at: Optional[str] = None
    start_level: int = Field(..., ge=1)
    start_exp: float = Field(..., ge=0)
    start_items: List[InventoryItemInput] = Field(default_factory=list)


class SessionEndRequest(BaseModel):
    ended_at: Optional[str] = None
    end_level: int = Field(..., ge=1)
    end_exp: float = Field(..., ge=0)
    end_items: List[InventoryItemInput] = Field(default_factory=list)


class ItemTransactionCreate(BaseModel):
    session_id: Optional[str] = None
    character_id: str
    clan_id: Optional[str] = None
    tx_type: str = Field(..., description="TO_PERSONAL | FROM_PERSONAL | TO_CLAN | FROM_CLAN | SELL | TRADE_OUT")
    item_id: str
    quantity: int = Field(..., gt=0)
    sale_total_adena: Optional[float] = Field(None, ge=0)
    note: str = Field("", max_length=300)


class AdminInventoryAdjustRequest(BaseModel):
    storage_type: str = Field(..., description="CHARACTER | PERSONAL | CLAN")
    character_id: Optional[str] = None
    clan_id: Optional[str] = None
    item_id: str
    after_qty: int = Field(..., ge=0)
    reason: str = Field(..., min_length=2, max_length=500)


class PayoutCreateRequest(BaseModel):
    worker_user_id: str
    worker_nickname: str
    period_start: str
    period_end: str
    total_play_minutes: int = Field(..., ge=0)
    total_earned_adena: float = Field(..., ge=0)
    avg_hourly_adena: float = Field(..., ge=0)
    hourly_rate_idr: float = Field(..., ge=0)
    bonus_idr: float = Field(0.0, ge=0)
    payment_method: str = Field("계좌이체/E-Wallet", max_length=100)
    payment_note: str = Field("", max_length=500)