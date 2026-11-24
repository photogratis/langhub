import re
from typing import List, Tuple
from urllib.parse import urlparse, parse_qs

try:
    from youtube_transcript_api import YouTubeTranscriptApi
except ImportError:
    YouTubeTranscriptApi = None

try:
    from deep_translator import GoogleTranslator
except ImportError:
    GoogleTranslator = None


def extract_youtube_video_id(url: str) -> str:
    url = (url or "").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", url):
        return url

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()

    if "youtu.be" in host:
        vid = parsed.path.lstrip("/").split("/")[0]
        if len(vid) == 11:
            return vid

    if "youtube.com" in host:
        if parsed.path == "/watch":
            qs = parse_qs(parsed.query)
            vid = (qs.get("v") or [""])[0]
            if len(vid) == 11:
                return vid
        for prefix in ("/embed/", "/shorts/", "/v/"):
            if parsed.path.startswith(prefix):
                vid = parsed.path[len(prefix):].split("/")[0]
                if len(vid) == 11:
                    return vid

    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
    if match:
        return match.group(1)

    raise ValueError("유효한 유튜브 URL 또는 영상 ID가 아닙니다.")


def fetch_and_merge_subtitles(video_id: str, auto_translate_id: bool = True) -> Tuple[str, List[dict]]:
    """
    youtube-transcript-api >= 1.2.x 대응:
    1) YouTubeTranscriptApi().list(video_id)로 한국어 기존 자막(수동/자동생성) 추출
    2) 인도네시아어 자막이 있으면 타임스탬프 기준 매칭, 없으면 자동 번역(deep_translator) 생성
    """
    if YouTubeTranscriptApi is None:
        raise RuntimeError("서버에 youtube-transcript-api 패키지가 설치되어 있지 않습니다.")

    ytt_api = YouTubeTranscriptApi()
    transcript_list = ytt_api.list(video_id)

    ko_transcript = None
    source_type = "YOUTUBE_CAPTION"

    # 수동 한국어 자막 우선 -> 자동 생성 한국어 자막 차선
    try:
        ko_transcript = transcript_list.find_manually_created_transcript(["ko"])
        source_type = "YOUTUBE_MANUAL_CAPTION"
    except Exception:
        try:
            ko_transcript = transcript_list.find_generated_transcript(["ko"])
            source_type = "YOUTUBE_AUTO_CAPTION"
        except Exception:
            for tr in transcript_list:
                if getattr(tr, "is_translatable", False):
                    ko_transcript = tr.translate("ko")
                    source_type = "YOUTUBE_TRANSLATED_KO"
                    break

    if ko_transcript is None:
        raise LookupError("이 영상에는 추출 가능한 유튜브 자막이 없습니다. 하단 음성인식(STT) 캡처 기능을 이용해 주세요.")

    fetched_ko = ko_transcript.fetch()
    ko_rows = fetched_ko.to_raw_data() if hasattr(fetched_ko, "to_raw_data") else list(fetched_ko)

    # 인도네시아어 자막 확보 시도
    id_rows = []
    try:
        id_tr = transcript_list.find_transcript(["id"])
        fetched_id = id_tr.fetch()
        id_rows = fetched_id.to_raw_data() if hasattr(fetched_id, "to_raw_data") else list(fetched_id)
    except Exception:
        try:
            if getattr(ko_transcript, "is_translatable", False):
                fetched_id = ko_transcript.translate("id").fetch()
                id_rows = fetched_id.to_raw_data() if hasattr(fetched_id, "to_raw_data") else list(fetched_id)
        except Exception:
            id_rows = []

    merged: List[dict] = []
    translator = GoogleTranslator(source="ko", target="id") if (auto_translate_id and GoogleTranslator) else None

    for idx, row in enumerate(ko_rows):
        start = round(float(row.get("start", 0.0)), 2)
        dur = float(row.get("duration", 2.0))
        next_start = float(ko_rows[idx + 1]["start"]) if idx + 1 < len(ko_rows) else (start + dur)
        end = round(min(start + dur, next_start) if next_start > start else (start + dur), 2)
        ko_text = re.sub(r"\s+", " ", row.get("text", "")).strip()
        if not ko_text:
            continue

        id_text = ""
        if id_rows:
            closest = min(id_rows, key=lambda r: abs(float(r.get("start", 0.0)) - start))
            if abs(float(closest.get("start", 0.0)) - start) <= 2.0:
                id_text = re.sub(r"\s+", " ", closest.get("text", "")).strip()

        if not id_text and translator:
            try:
                id_text = translator.translate(ko_text) or ""
            except Exception:
                id_text = ""

        merged.append({
            "start": start,
            "end": end,
            "ko": ko_text,
            "id": id_text,
            "source": source_type,
        })

    return source_type, merged