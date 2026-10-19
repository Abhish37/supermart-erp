import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Load .env from project root
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = ROOT_DIR / ".env"

class Settings(BaseSettings):
    PROJECT_NAME: str = "SuperMart ERP & High-Velocity POS"
    PORT: int = 8000
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://omni_agent_db_user:v0drAqdSArRKRQOTTTRwjGZzm9djr4WH@dpg-db3t3srl550s73br02o0-a.oregon-postgres.render.com:5432/omni_agent_db?sslmode=require"
    )
    
    # Redis
    REDIS_URL: str = os.getenv(
        "REDIS_URL",
        "rediss://red-db3sndd9fdbs73f2ru4g:lWYbnS8jpOui7g6W90ErFGRfHf7EbP1w@oregon-keyvalue.render.com:6379"
    )
    UPSTASH_REDIS_REST_TOKEN: str = os.getenv("UPSTASH_REDIS_REST_TOKEN", "37e7fa8d-0ca1-45ba-8caf-ff97460520b2")
    
    # Scan debouncing window (prevent rapid duplicate scans on POS)
    SCAN_DEBOUNCE_WINDOW_MS: int = 800
    
    # Payday Tsunami Peak-Day Buffer (1st to 10th of every month)
    PEAK_DAY_BUFFER_START: int = 1
    PEAK_DAY_BUFFER_END: int = 10
    PEAK_DAY_BUFFER_MULTIPLIER: float = 1.50
    
    # Dead Stock alert threshold
    DEAD_STOCK_THRESHOLD_DAYS: int = 20
    
    # WhatsApp configuration
    WHATSAPP_ENABLED: bool = False
    WHATSAPP_API_TOKEN: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    OWNER_PHONE_NUMBER: str = "+919876543210"

    class Config:
        env_file = str(ENV_PATH)
        extra = "ignore"

settings = Settings()
