# app/core/logging.py
import logging, os

def setup_logging():
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    fmt = "[%(asctime)s] %(levelname)s %(name)s: %(message)s"
    logging.basicConfig(level=level, format=fmt)
    # uvicorn 접두 로거도 레벨 맞추기
    logging.getLogger("uvicorn").setLevel(level)
    logging.getLogger("uvicorn.error").setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(level)
