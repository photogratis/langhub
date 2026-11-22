from typing import Callable, List

# 연결 모듈(conn_*)이 외부에서 말뭉치 조회 함수를 등록할 수 있는 훅 리스트
_corpus_providers: List[Callable[[str], List[dict]]] = []

def register_corpus_provider(provider_fn: Callable[[str], List[dict]]):
    _corpus_providers.append(provider_fn)

def fetch_linked_corpus(word_id: str) -> List[dict]:
    results = []
    for provider in _corpus_providers:
        try:
            items = provider(word_id)
            if items:
                results.extend(items)
        except Exception:
            pass
    return results