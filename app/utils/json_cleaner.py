# utils/json_cleaner.py
import json
import re

def clean_and_parse_json(response_text: str):
    """
    Gemini API 응답 문자열에서 ```json, ``` 등의 마크다운 제거 및 파싱
    """
    # 마크다운 코드 블록 제거
    cleaned = re.sub(r"^```json|```$", "", response_text.strip(), flags=re.MULTILINE)

    # 작은 따옴표 → 큰 따옴표 변환 (가끔 오류 방지용)
    normalized = cleaned.replace("'", '"')

    try:
        return json.loads(normalized)
    except json.JSONDecodeError as e:
        print("JSON 파싱 실패:", e)
        raise ValueError("유효한 JSON이 아닙니다.")
