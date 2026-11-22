from typing import List
from app.core.database import supabase
from app.modules.ko_id_dict.corpus_hook import register_corpus_provider


def provide_corpus_for_ko_word(word_ko: str) -> List[dict]:
    """한-인사전 표제어(word_ko)에 연결된 말뭉치와 문법 패턴을 조회하여 반환"""
    word_res = supabase.table("ko_id_dictionary").select("id").eq("word_ko", word_ko).execute()
    if not word_res.data:
        return []

    word_ids = [row["id"] for row in word_res.data]
    corpus_res = (
        supabase.table("dict_grammar_corpus")
        .select("id, sentence_ko, sentence_id, note, ko_grammar_dictionary(pattern, meaning_id)")
        .in_("dict_word_id", word_ids)
        .execute()
    )

    formatted = []
    for row in (corpus_res.data or []):
        grammar_info = row.get("ko_grammar_dictionary") or {}
        formatted.append({
            "id": row["id"],
            "pattern": grammar_info.get("pattern", ""),
            "grammar_meaning": grammar_info.get("meaning_id", ""),
            "sentence": f"{row['sentence_ko']} → {row['sentence_id']}",
            "sentence_ko": row["sentence_ko"],
            "sentence_id": row["sentence_id"],
            "note": row.get("note", ""),
        })
    return formatted


# 모듈 로드 시점에 한-인사전 훅에 자동 등록
register_corpus_provider(provide_corpus_for_ko_word)