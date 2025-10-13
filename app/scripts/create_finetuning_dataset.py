# app/scripts/create_finetuning_dataset.py
import os
import sys
import json
import random
from collections import Counter, defaultdict

import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# -----------------------------
# 프로젝트 루트 및 .env 로드
# -----------------------------
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, project_root)

load_dotenv(dotenv_path=os.path.join(project_root, ".env"))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

if not all([DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME]):
    raise ValueError(".env 파일에 DB 접속 정보를 모두 설정해야 합니다.")

MYSQL_DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
)

# -----------------------------
# Paraphrase 사전 (입력 다양화)
# -----------------------------
PARA_MAP = {
    # 취향/스타일
    "먹방 여행": ["먹거리 탐방", "맛집 투어", "푸드트립", "길거리 음식 집중", "현지식 위주"],
    "감성 여행": ["무드 여행", "분위기 여행", "감성 충만 여행", "느긋한 감성 트립", "감성 중심"],
    # 교통
    "public": ["public", "대중교통", "non-driving", "운전 안함"],
    "car": ["car", "자가운전", "렌터카", "운전 중심"],
    # 밀도
    "active": ["active", "활동적", "빽빽하게", "타이트하게"],
    "relaxed": ["relaxed", "여유롭게", "느긋하게", "라이트하게"],
    # 기후
    "fresh": ["fresh", "선선함", "서늘하고 맑음", "청량한 날씨"],
    "snowy": ["snowy", "눈 풍경", "겨울 감성", "설경 선호"],
}

def _paraphrase_preferences(pref: dict, max_variants: int = 2) -> list[dict]:
    """preferences 일부 key를 동의어로 치환해 입력 표현을 다양화한다."""
    variants: list[dict] = []
    for _ in range(max_variants):
        newp = dict(pref)

        # style 리스트의 첫 요소만 가볍게 변형
        if isinstance(newp.get("style"), list) and newp["style"]:
            s0 = newp["style"][0]
            cand = PARA_MAP.get(s0, [])
            if cand:
                newp["style"] = [random.choice(cand)]

        # driving / density / climate 문자열은 동의어 중 하나로 변형
        for k in ["driving", "density", "climate"]:
            if k in newp and isinstance(newp[k], str):
                cand = PARA_MAP.get(newp[k], [])
                if cand:
                    newp[k] = random.choice(cand)

        # null window는 일부 채워 안정적 분포 만들기
        if newp.get("depart_window") is None:
            newp["depart_window"] = random.choice([None, "morning", "afternoon", "evening"])
        if newp.get("return_window") is None:
            newp["return_window"] = random.choice([None, "morning", "afternoon", "evening"])

        variants.append(newp)
    return variants


def create_finetuning_dataset(
    output_filename: str = "finetuning_dataset_gemini.jsonl",
    # 모수 확대
    min_rating: int = 2,                  # rating 기준 (NULL 포함)
    max_rows: int | None = None,          # 상한(최신순 일부만 사용하고 싶을 때)
    # 증강
    do_augment: bool = True,
    aug_per_sample: int = 3,              # 샘플당 추가 변형 개수
    # 중복 정책
    dedup_mode: str = "pair",             # "input" | "pair"  (입력만 / 입력+출력 쌍)
    allow_dupes_per_input: int = 3,       # 동일 입력에서 허용할 다른 결과의 최대 개수
    # 결측/컷 정책
    allow_no_style: bool = True,          # style 없으면 기본값 부여
    default_style: str = "감성 여행",
    min_output_len: int = 20,             # 출력 최소 길이 컷(문자 기준)
):
    """
    DB → (정제/증강/중복정책) → JSONL(messages [{user, model}]) 파일 생성
    - dedup_mode="pair": 같은 입력이라도 결과가 다르면 살림(권장)
    - allow_dupes_per_input: 한 입력에서 과도한 결과 중복 방지
    """
    print("MySQL 연결 중...")
    engine = create_engine(MYSQL_DATABASE_URL)

    query = """
    SELECT 
        s.preferences AS preferences, 
        r.result      AS result,
        r.rating      AS rating,
        r.created_at  AS created_at
    FROM recommendation r
    JOIN surveys s ON r.survey_id = s.id
    WHERE (r.rating IS NULL OR r.rating >= :min_rating)
    ORDER BY r.created_at DESC
    """

    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn, params={"min_rating": min_rating})

    total = len(df)
    print(f"불러온 원본 레코드: {total}개 (min_rating={min_rating}, NULL 포함)")

    # 상한 적용
    if max_rows is not None and total > max_rows:
        df = df.head(max_rows)
        print(f"상한 적용: {len(df)}개로 컷")

    skips: Counter = Counter()
    rows: list[dict] = []

    seen_inputs: set[str] = set()
    seen_pairs: set[str] = set()
    input_counts: defaultdict[str, int] = defaultdict(int)

    for i, row in df.iterrows():
        try:
            pref_raw = row["preferences"]

            # preferences 파싱
            try:
                preferences = json.loads(pref_raw) if isinstance(pref_raw, str) else pref_raw
            except Exception:
                skips["JSON 파싱 실패(preferences)"] += 1
                continue

            if not isinstance(preferences, dict):
                skips["preferences 타입 아님"] += 1
                continue

            # style 기본값 처리
            if "style" not in preferences or not preferences.get("style"):
                if allow_no_style:
                    preferences["style"] = [default_style]
                else:
                    skips["style 없음"] += 1
                    continue

            # 출력 직렬화 + 길이 컷
            result_raw = row["result"]
            output_text = result_raw if isinstance(result_raw, str) else json.dumps(
                result_raw, ensure_ascii=False, separators=(",", ":")
            )
            if not isinstance(output_text, str) or len(output_text.strip()) < min_output_len:
                skips[f"출력 너무 짧음(<{min_output_len})"] += 1
                continue

            # 입력 직렬화
            input_text = json.dumps(preferences, ensure_ascii=False, separators=(",", ":"))
            pair_key = input_text + "||" + output_text

            # 중복 정책
            if dedup_mode == "input":
                if input_text in seen_inputs:
                    skips["입력 중복"] += 1
                    continue
                seen_inputs.add(input_text)

            elif dedup_mode == "pair":
                if pair_key in seen_pairs:
                    skips["입출력 쌍 중복"] += 1
                    continue
                if input_counts[input_text] >= allow_dupes_per_input:
                    skips["동일 입력 과다"] += 1
                    continue
                seen_pairs.add(pair_key)
                input_counts[input_text] += 1

            # 원본 샘플 추가
            rows.append({
                "messages": [
                    {"role": "user", "content": input_text},
                    {"role": "model", "content": output_text}
                ]
            })

            # 증강 샘플 추가
            if do_augment and aug_per_sample > 0:
                for vp in _paraphrase_preferences(preferences, max_variants=aug_per_sample):
                    v_input = json.dumps(vp, ensure_ascii=False, separators=(",", ":"))
                    v_pair = v_input + "||" + output_text

                    if dedup_mode == "input":
                        if v_input in seen_inputs:
                            skips["입력 중복(증강)"] += 1
                            continue
                        seen_inputs.add(v_input)

                    elif dedup_mode == "pair":
                        if v_pair in seen_pairs:
                            skips["입출력 쌍 중복(증강)"] += 1
                            continue
                        if input_counts[v_input] >= allow_dupes_per_input:
                            skips["동일 입력 과다(증강)"] += 1
                            continue
                        seen_pairs.add(v_pair)
                        input_counts[v_input] += 1

                    rows.append({
                        "messages": [
                            {"role": "user", "content": v_input},
                            {"role": "model", "content": output_text}
                        ]
                    })

        except Exception as e:
            skips["기타 예외"] += 1
            print(f"[스킵] 행 {i} 처리 오류: {e}")

    # 저장
    output_path = os.path.join(project_root, output_filename)
    with open(output_path, "w", encoding="utf-8") as f:
        for item in rows:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # 로그
    print(f"생성 완료: {output_path}")
    print(f"최종 샘플 수: {len(rows)}개 (원본+증강 포함)")
    if len(rows) < 100:
        print("⚠️ 경고: 파인튜닝에는 100~500개 이상을 권장합니다.")
    if skips:
        print("— 스킵 통계 —")
        for k, v in skips.most_common():
            print(f"  · {k}: {v}")


if __name__ == "__main__":
    # 필요 시 파라미터 조정해서 호출 가능
    create_finetuning_dataset(
    output_filename="finetuning_dataset_gemini.jsonl",
    min_rating=2,              # 그대로
    max_rows=None,
    do_augment=True,
    aug_per_sample=4,          # 3 → 4 (증강 조금 강화)
    dedup_mode="pair",         # 그대로 (입력+출력 쌍 기준)
    allow_dupes_per_input=5,   # 3 → 5 (동일 입력 허용치 ↑)
    allow_no_style=True,
    default_style="감성 여행",
    min_output_len=20,         # 그대로 (노이즈 방지)
)

