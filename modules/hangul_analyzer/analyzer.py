import re
from typing import Dict, List, Tuple
from app.core.database import supabase

# 한글 유니코드 조합 테이블
CHOSUNG_LIST = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
    "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
]
JUNGSUNG_LIST = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
    "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
]
JONGSUNG_LIST = [
    "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
    "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
]

# 주요 한국어 조사 사전 (긴 조사부터 매칭되도록 길이순 정렬)
KOREAN_JOSA_MAP: Dict[str, str] = {
    "에서부터": "dari (tempat/waktu)",
    "으로부터": "dari (arah/sumber)",
    "로부터": "dari (arah/sumber)",
    "한테서": "dari (orang - lisan)",
    "에게서": "dari (orang)",
    "에서는": "di (penekanan topik)",
    "에서도": "di ... juga",
    "으로는": "dengan / ke (topik)",
    "로는": "dengan / ke (topik)",
    "이라도": "meskipun / bahkan",
    "라도": "meskipun / bahkan",
    "이나": "atau / sebanyak",
    "나": "atau",
    "처럼": "seperti",
    "같이": "seperti / bersama",
    "보다": "daripada",
    "까지": "sampai",
    "부터": "mulai dari",
    "마다": "setiap",
    "밖에": "hanya / selain (+negatif)",
    "조차": "bahkan",
    "마저": "bahkan (tersisa)",
    "한테": "kepada (lisan)",
    "에게": "kepada",
    "께서": "partikel subjek hormat",
    "에서": "di / dari (tempat kegiatan)",
    "으로": "ke / dengan (alat/cara)",
    "로": "ke / dengan (alat/cara)",
    "하고": "dan / dengan",
    "와": "dan / dengan",
    "과": "dan / dengan",
    "의": "kepunyaan (-nya)",
    "은": "partikel topik",
    "는": "partikel topik",
    "이": "partikel subjek",
    "가": "partikel subjek",
    "을": "partikel objek",
    "를": "partikel objek",
    "에": "di / ke / pada",
    "도": "juga",
    "만": "hanya",
}
SORTED_JOSA = sorted(KOREAN_JOSA_MAP.keys(), key=len, reverse=True)


def count_hangul_jamo(text: str) -> Tuple[int, Dict[str, int], Dict[str, int], Dict[str, int]]:
    """한글 음절을 초성/중성/종성으로 분해하여 개수 집계"""
    syllable_count = 0
    cho_counts: Dict[str, int] = {}
    jung_counts: Dict[str, int] = {}
    jong_counts: Dict[str, int] = {}

    for ch in text:
        code = ord(ch)
        # 완성형 한글 범위 (가 ~ 힣)
        if 0xAC00 <= code <= 0xD7A3:
            syllable_count += 1
            offset = code - 0xAC00
            cho_idx = offset // 588
            jung_idx = (offset % 588) // 28
            jong_idx = offset % 28

            cho = CHOSUNG_LIST[cho_idx]
            jung = JUNGSUNG_LIST[jung_idx]
            jong = JONGSUNG_LIST[jong_idx]

            cho_counts[cho] = cho_counts.get(cho, 0) + 1
            jung_counts[jung] = jung_counts.get(jung, 0) + 1
            if jong:
                jong_counts[jong] = jong_counts.get(jong, 0) + 1
        # 단독 자음 (ㄱ ~ ㅎ) 입력 시
        elif 0x3131 <= code <= 0x314E:
            cho_counts[ch] = cho_counts.get(ch, 0) + 1
        # 단독 모음 (ㅏ ~ ㅣ) 입력 시
        elif 0x314F <= code <= 0x3163:
            jung_counts[ch] = jung_counts.get(ch, 0) + 1

    return syllable_count, cho_counts, jung_counts, jong_counts


def split_token_and_josa(clean_word: str) -> Tuple[str, str | None, str | None]:
    """어절 끝에서 조사를 분리해 (어간/명사, 조사, 조사뜻) 반환"""
    if len(clean_word) >= 2:
        for josa in SORTED_JOSA:
            if clean_word.endswith(josa) and len(clean_word) > len(josa):
                stem = clean_word[:-len(josa)]
                return stem, josa, KOREAN_JOSA_MAP[josa]
    return clean_word, None, None


def analyze_korean_text(text: str) -> dict:
    total_with_space = len(text)
    total_without_space = len(text.replace(" ", "").replace("\n", "").replace("\t", ""))
    syllable_count, cho_counts, jung_counts, jong_counts = count_hangul_jamo(text)

    # 1. 어절 분리 및 한-인사전(ko_id_dictionary) 조회
    raw_tokens = text.split()
    word_analyses = []
    candidate_stems = set()

    parsed_tokens = []
    for raw in raw_tokens:
        clean = re.sub(r"[^\w가-힣]", "", raw)
        if not clean:
            continue
        stem, josa, josa_meaning = split_token_and_josa(clean)
        parsed_tokens.append((raw, clean, stem, josa, josa_meaning))
        candidate_stems.add(clean)
        candidate_stems.add(stem)

    # DB에서 후보 단어 일괄 조회 (N+1 쿼리 방지)
    dict_map: Dict[str, List[dict]] = {}
    if candidate_stems:
        try:
            res = (
                supabase.table("ko_id_dictionary")
                .select("id, word_ko, meaning_id, pos, tags")
                .in_("word_ko", list(candidate_stems))
                .execute()
            )
            for row in (res.data or []):
                w = row["word_ko"]
                dict_map.setdefault(w, []).append(row)
        except Exception:
            pass

    for raw, clean, stem, josa, josa_meaning in parsed_tokens:
        matches = dict_map.get(clean, [])
        if not matches and stem != clean:
            matches = dict_map.get(stem, [])
        word_analyses.append({
            "token": raw,
            "stem": stem,
            "josa": josa,
            "josa_meaning_id": josa_meaning,
            "dict_matches": matches,
        })

    # 2. 문법사전 DB(ko_grammar_dictionary)에서 문장 내 포함된 문법 패턴 탐색
    matched_grammars = []
    if text.strip():
        try:
            g_res = supabase.table("ko_grammar_dictionary").select("id, pattern, meaning_id, level, usage_rule").execute()
            for g in (g_res.data or []):
                pattern = g.get("pattern", "")
                # "-아/어서", "-(으)려고", "-고 싶다" 등에서 핵심 어미 토큰 추출
                core_parts = [
                    p.replace("-", "").replace("(으)", "").replace("(", "").replace(")", "").strip()
                    for p in pattern.split("/")
                ]
                for part in core_parts:
                    if len(part) >= 1 and part in text:
                        matched_grammars.append(g)
                        break
        except Exception:
            pass

    return {
        "total_chars_with_space": total_with_space,
        "total_chars_without_space": total_without_space,
        "hangul_syllable_count": syllable_count,
        "chosung_counts": cho_counts,
        "jungsung_counts": jung_counts,
        "jongsung_counts": jong_counts,
        "word_analyses": word_analyses,
        "matched_grammars": matched_grammars,
    }