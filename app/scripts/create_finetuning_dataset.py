import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import json

# --- 시스템 경로 및 설정 로드 ---
import sys
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

# .env 파일에서 MySQL 접속 정보 직접 조합
load_dotenv(dotenv_path=os.path.join(project_root, '.env'))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

if not all([DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME]):
    raise ValueError(".env 파일에 DB 접속 정보를 모두 설정해야 합니다.")

MYSQL_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"

def create_finetuning_dataset():
    """
    MySQL에서 평점이 높은 데이터를 추출하여,
    최신 Gemini 파인튜닝을 위한 JSONL 형식의 데이터셋을 생성합니다.
    """
    print("MySQL 데이터베이스에 연결 중...")
    engine = create_engine(MYSQL_DATABASE_URL)
    
    query = """
    SELECT 
        s.preferences, 
        r.result
    FROM recommendation r
    JOIN surveys s ON r.survey_id = s.id
    WHERE r.rating >= 4;
    """
    
    df = pd.read_sql(query, engine)
    print(f"총 {len(df)}개의 고품질 데이터를 불러왔습니다.")

    if len(df) < 50:
        print(f"경고: 데이터 양({len(df)}개)이 파인튜닝에 충분하지 않을 수 있습니다. (최소 100개 이상 권장)")

    output_filename = "finetuning_dataset_gemini.jsonl" # ◀◀ 최종 파일 이름
    output_path = os.path.join(project_root, output_filename)
    
    print(f"'{output_filename}' 파일 생성을 시작합니다...")
    
    count = 0
    with open(output_path, 'w', encoding='utf-8') as f:
        for index, row in df.iterrows():
            try:
                preferences_raw = row['preferences']
                preferences = json.loads(preferences_raw) if isinstance(preferences_raw, str) else preferences_raw
                
                if 'style' not in preferences:
                    continue

                input_text_str = json.dumps(preferences, ensure_ascii=False)
                result_raw = row['result']
                output_text_str = json.dumps(result_raw, ensure_ascii=False) if not isinstance(result_raw, str) else result_raw
                
                # ▼▼▼ [핵심 수정] 필드 이름을 최신 Gemini 형식으로 변경합니다. ▼▼▼
                dataset_line = {
                    "messages": [
                        {"role": "user", "content": input_text_str},
                        {"role": "model", "content": output_text_str}
                    ]
                }
                # ▲▲▲ 수정 완료 ▲▲▲

                f.write(json.dumps(dataset_line, ensure_ascii=False) + "\n")
                count += 1
            except Exception as e:
                print(f"데이터 처리 중 오류 발생 (행: {index}): {e}")


    print(f"'{output_path}'에 총 {count}개의 최종 학습 데이터 생성이 완료되었습니다.")
    print("이제 이 새로운 파일을 Vertex AI에 업로드하여 모델 파인튜닝을 다시 시작해주세요.")

if __name__ == "__main__":
    create_finetuning_dataset()

