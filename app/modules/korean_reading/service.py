import re
from typing import List, Tuple

CHOSEONG = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
]
JUNGSEONG = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
    "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
]
JONGSEONG = [
    "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
    "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
]


def normalize_korean_text(text: str) -> str:
    """문장부호와 불필요한 공백을 제거하고 한글/숫자/영문만 남김"""
    cleaned = re.sub(r"[^가-힣a-zA-Z0-9\s]", "", text or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def decompose_hangul(text: str) -> str:
    """한글 문자열을 초성·중성·종성 자모 단위로 분해하여 부분 발음 유사도까지 반영"""
    result = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            offset = code - 0xAC00
            cho = offset // 588
            jung = (offset % 588) // 28
            jong = offset % 28
            result.append(CHOSEONG[cho])
            result.append(JUNGSEONG[jung])
            if jong > 0:
                result.append(JONGSEONG[jong])
        else:
            result.append(ch)
    return "".join(result)


def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    return previous_row[-1]


def evaluate_reading_accuracy(original_text: str, recognized_text: str) -> Tuple[float, List[dict]]:
    """
    원문 지문과 음성인식 결과 텍스트를 비교하여
    1) 자모 기반 정확도(%)와 2) 어절별 정오답 diff 토큰 목록을 반환
    """
    norm_orig = normalize_korean_text(original_text)
    norm_rec = normalize_korean_text(recognized_text)

    if not norm_orig:
        return 0.0, []

    orig_words = [w for w in original_text.strip().split() if w]
    if not norm_rec:
        return 0.0, [{"word": w, "matched": False} for w in orig_words]

    # 공백 제거 후 자모 단위로 전체 정확도 산출
    jamo_orig = decompose_hangul(norm_orig.replace(" ", ""))
    jamo_rec = decompose_hangul(norm_rec.replace(" ", ""))

    max_len = max(len(jamo_orig), len(jamo_rec), 1)
    dist = levenshtein_distance(jamo_orig, jamo_rec)
    accuracy = round(max(0.0, (1.0 - dist / max_len) * 100.0), 1)

    # 원문 어절별 매칭 여부 계산 (UI 하이라이트용)
    rec_compact = norm_rec.replace(" ", "")
    diff_tokens = []
    search_cursor = 0

    for raw_w in orig_words:
        clean_w = normalize_korean_text(raw_w).replace(" ", "")
        if not clean_w:
            diff_tokens.append({"word": raw_w, "matched": True})
            continue

        # 현재 커서 근처 윈도우에서 해당 어절이 일치하는지 확인
        window = rec_compact[max(0, search_cursor - 4): search_cursor + len(clean_w) + 8]
        if clean_w in window:
            diff_tokens.append({"word": raw_w, "matched": True})
            found_idx = window.find(clean_w)
            search_cursor = max(0, search_cursor - 4) + found_idx + len(clean_w)
        else:
            # 자모 유사도가 70% 이상이면 발음 유사 정답으로 인정
            j_w = decompose_hangul(clean_w)
            sub_win = rec_compact[search_cursor: search_cursor + len(clean_w)]
            j_sub = decompose_hangul(sub_win)
            w_dist = levenshtein_distance(j_w, j_sub)
            w_sim = 1.0 - (w_dist / max(len(j_w), 1))
            matched = w_sim >= 0.7
            diff_tokens.append({"word": raw_w, "matched": matched})
            if matched:
                search_cursor += len(clean_w)

    return accuracy, diff_tokens


def compute_passage_stats(content: str) -> Tuple[int, int]:
    """공백 제외 음절 수(char_count)와 어절 수(word_count) 반환"""
    char_count = len(re.sub(r"\s+", "", content or ""))
    word_count = len([w for w in (content or "").strip().split() if w])
    return char_count, word_count