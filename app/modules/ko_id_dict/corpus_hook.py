from typing import Callable, List

_corpus_providers: List[Callable[[str], List[dict]]] = []


def register_corpus_provider(provider_fn: Callable[[str], List[dict]]):
    _corpus_providers.append(provider_fn)


def fetch_linked_corpus(word_ko: str) -> List[dict]:
    results = []
    for provider in _corpus_providers:
        try:
            items = provider(word_ko)
            if items:
                results.extend(items)
        except Exception:
            pass
    return results