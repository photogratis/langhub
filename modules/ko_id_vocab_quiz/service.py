import random
import re
from typing import List, Dict, Set, Optional
from fastapi import HTTPException
from app.core.database import supabase
from app.modules.ko_id_vocab_quiz.schemas import (
    QuizGenerateRequest,
    QuizGenerateResponse,
    QuizQuestion,
    QuizChoice,
    QuizGradeRequest,
    QuizGradeResponse,
    GradedQuestionResult,
)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _extract_meaning_tokens(meaning_str: str) -> Set[str]:
    """
    'makan, bersantap / menyantap; mengonsumsi' 같은 뜻 문자열을
    개별 의미 단위로 분리하여 의미 중복 비교용 집합으로 반환
    """
    if not meaning_str:
        return set()
    # 괄호 안 부가설명 제거 후 구분자(, / ; ~)로 분리
    without_parens = re.sub(r"\([^)]*\)", "", meaning_str)
    parts = re.split(r"[,/;~|]+", without_parens)
    tokens = set()
    for p in parts:
        norm = _normalize_text(p)
        if norm:
            tokens.add(norm)
    return tokens


def _is_semantically_conflicting(target: dict, candidate: dict) -> bool:
    """
    정답 단어(target)와 보기 후보(candidate)가 유사어이거나
    동일한 의미를 전달할 가능성이 있는지 4단계로 판별
    """
    if str(target["id"]) == str(candidate["id"]):
        return True

    t_ko = _normalize_text(target.get("word_ko", ""))
    c_ko = _normalize_text(candidate.get("word_ko", ""))
    t_id = _normalize_text(target.get("meaning_id", ""))
    c_id = _normalize_text(candidate.get("meaning_id", ""))

    # 1. 표제어 또는 뜻 문자열 자체가 완전히 동일한 경우
    if t_ko == c_ko or t_id == c_id:
        return True

    # 2. 사전에 등록된 유의어(synonyms) 양방향 검사
    t_syns = {_normalize_text(s) for s in (target.get("synonyms") or []) if s.strip()}
    c_syns = {_normalize_text(s) for s in (candidate.get("synonyms") or []) if s.strip()}

    if c_ko in t_syns or t_ko in c_syns:
        return True
    # 두 단어의 유의어 집합에 교집합이 있는 경우도 같은 의미군으로 간주해 배제
    if t_syns and c_syns and (t_syns & c_syns):
        return True

    # 3. 인도네시아어 뜻 토큰 교집합 검사 (유의어 미등록 동의어 차단)
    t_tokens = _extract_meaning_tokens(target.get("meaning_id", ""))
    c_tokens = _extract_meaning_tokens(candidate.get("meaning_id", ""))
    if t_tokens and c_tokens and (t_tokens & c_tokens):
        return True

    return False


def _pick_distractors(target: dict, pool: List[dict], needed: int = 3) -> List[dict]:
    """
    유의어·동의어를 모두 배제한 상태에서 같은 품사를 우선하여 오답 보기 추출
    """
    safe_candidates = [
        item for item in pool
        if not _is_semantically_conflicting(target, item)
    ]

    same_pos = [c for c in safe_candidates if c.get("pos") == target.get("pos")]
    diff_pos = [c for c in safe_candidates if c.get("pos") != target.get("pos")]

    random.shuffle(same_pos)
    random.shuffle(diff_pos)

    picked: List[dict] = []
    used_texts: Set[str] = {
        _normalize_text(target.get("word_ko", "")),
        _normalize_text(target.get("meaning_id", "")),
    }

    for cand in same_pos + diff_pos:
        if len(picked) >= needed:
            break
        # 이미 뽑힌 오답 보기끼리도 의미나 텍스트가 겹치지 않도록 한 번 더 검증
        if any(_is_semantically_conflicting(already, cand) for already in picked):
            continue
        c_ko_norm = _normalize_text(cand.get("word_ko", ""))
        c_id_norm = _normalize_text(cand.get("meaning_id", ""))
        if c_ko_norm in used_texts or c_id_norm in used_texts:
            continue

        picked.append(cand)
        used_texts.add(c_ko_norm)
        used_texts.add(c_id_norm)

    return picked


def generate_vocab_quiz(req: QuizGenerateRequest) -> QuizGenerateResponse:
    res = supabase.table("ko_id_dictionary").select("*").execute()
    all_words = res.data or []

    if req.tag and req.tag.strip():
        target_tag = req.tag.strip().lower()
        target_pool = [
            w for w in all_words
            if any(target_tag in t.lower() for t in (w.get("tags") or []))
        ]
    else:
        target_pool = list(all_words)

    if len(all_words) < 4:
        raise HTTPException(
            status_code=400,
            detail="4지선다 시험을 출제하려면 한-인 사전에 최소 4개 이상의 단어가 등록되어 있어야 합니다."
        )

    if not target_pool:
        raise HTTPException(
            status_code=404,
            detail="선택한 조건(태그)에 해당하는 단어가 사전에 없습니다."
        )

    actual_count = min(req.question_count, len(target_pool))
    selected_targets = random.sample(target_pool, actual_count)

    questions: List[QuizQuestion] = []
    for idx, target in enumerate(selected_targets, start=1):
        # 오답 보기는 전체 사전(all_words)에서 의미 충돌 없는 단어로 추출
        distractors = _pick_distractors(target, all_words, needed=3)
        if len(distractors) < 3:
            raise HTTPException(
                status_code=400,
                detail="유의어/동의어를 제외한 서로 다른 의미의 단어가 부족하여 4지선다 보기를 구성할 수 없습니다. 사전에 다양한 의미의 단어를 더 등록해 주세요."
            )

        q_dir = req.direction
        if q_dir == "mixed":
            q_dir = random.choice(["ko_to_id", "id_to_ko"])

        if q_dir == "id_to_ko":
            prompt_word = target["meaning_id"]
            correct_text = target["word_ko"]
            distractor_texts = [d["word_ko"] for d in distractors]
        else:
            q_dir = "ko_to_id"
            prompt_word = target["word_ko"]
            correct_text = target["meaning_id"]
            distractor_texts = [d["meaning_id"] for d in distractors]

        correct_id = f"q{idx}_correct"
        raw_choices = [QuizChoice(choice_id=correct_id, text=correct_text)] + [
            QuizChoice(choice_id=f"q{idx}_d{d_i}", text=txt)
            for d_i, txt in enumerate(distractor_texts, start=1)
        ]
        random.shuffle(raw_choices)

        questions.append(
            QuizQuestion(
                question_no=idx,
                word_id=str(target["id"]),
                direction=q_dir,
                prompt_word=prompt_word,
                pos=target.get("pos", ""),
                choices=raw_choices,
                correct_choice_id=correct_id,
                correct_text=correct_text,
            )
        )

    return QuizGenerateResponse(
        total_available_words=len(target_pool),
        question_count=len(questions),
        time_limit_seconds=req.time_limit_seconds,
        questions=questions,
    )


def grade_vocab_quiz(req: QuizGradeRequest) -> QuizGradeResponse:
    total = len(req.answers)
    correct_count = 0
    results: List[GradedQuestionResult] = []

    for ans in req.answers:
        is_ok = bool(ans.selected_choice_id and ans.selected_choice_id == ans.correct_choice_id)
        if is_ok:
            correct_count += 1

        user_text = ans.selected_text if ans.selected_text else "(미선택 / 시간초과)"
        results.append(
            GradedQuestionResult(
                question_no=ans.question_no,
                prompt_word=ans.prompt_word,
                pos=ans.pos,
                is_correct=is_ok,
                user_answer_text=user_text,
                correct_answer_text=ans.correct_text,
            )
        )

    wrong_count = total - correct_count
    score = round((correct_count / total) * 100) if total > 0 else 0

    return QuizGradeResponse(
        total_questions=total,
        correct_count=correct_count,
        wrong_count=wrong_count,
        score=score,
        elapsed_seconds=req.elapsed_seconds,
        results=results,
    )