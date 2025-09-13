import google.generativeai as genai
import os
from dotenv import load_dotenv
import sys

# --- 시스템 경로 추가 ---
# 이 스크립트가 'app' 모듈을 찾을 수 있도록 프로젝트 루트 경로를 올바르게 설정합니다.
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

# --- 설정 부분 ---
# 프로젝트 루트에 있는 .env 파일에서 API 키를 로드합니다.
load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
API_KEY = os.getenv("GOOGLE_API_KEY")

if not API_KEY:
    raise ValueError(".env 파일에 GOOGLE_API_KEY를 설정해야 합니다.")

genai.configure(api_key=API_KEY)

# --- 사용 가능한 모델 목록을 출력하는 함수 ---
def list_available_models():
    """사용 가능한 Gemini 모델 목록을 출력합니다."""
    print("사용 가능한 Gemini 모델 목록 (generateContent 지원):")
    try:
        for m in genai.list_models():
            # generateContent 메서드를 지원하는 모델만 필터링하여 보여줍니다.
            if 'generateContent' in m.supported_generation_methods:
                print(f"- {m.name}")
    except Exception as e:
        print(f"모델 목록을 가져오는 중 오류 발생: {e}")

if __name__ == "__main__":
    list_available_models()
