import threading
import httpx
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
from app.core.config import settings

_thread_local = threading.local()


def get_thread_supabase() -> Client:
    """각 워커 스레드마다 독립된 Supabase(httpx) 클라이언트를 생성·재사용하여 동시 접속 충돌 방지"""
    client = getattr(_thread_local, "client", None)
    if client is None:
        # HTTP/1.1 커넥션 풀 + 자동 재시도(3회) 설정으로 동시 쓰기 시 StreamReset/연결 끊김 방지
        transport = httpx.HTTPTransport(retries=3)
        http_client = httpx.Client(
            transport=transport,
            timeout=httpx.Timeout(20.0, connect=10.0),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
        options = SyncClientOptions(
            postgrest_client_timeout=20,
            storage_client_timeout=30,
            httpx_client=http_client,
        )
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY, options=options)
        _thread_local.client = client
    return client


class _ThreadSafeSupabaseProxy:
    """기존 코드의 `supabase.table(...)`, `supabase.storage...` 문법을 100% 그대로 유지하는 프록시"""
    def __getattr__(self, name):
        return getattr(get_thread_supabase(), name)


supabase: Client = _ThreadSafeSupabaseProxy()