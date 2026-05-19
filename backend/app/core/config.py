from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "production"
    APP_DEBUG: bool = False
    APP_SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: List[str] = ["*"]

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_PREFIX: str = "/api/v1"

    DATABASE_URL: str = "postgresql+asyncpg://iptv_user:password@postgres:5432/iptv_platform"

    REDIS_URL: str = "redis://redis:6379/0"

    JWT_SECRET_KEY: str = "change-me-jwt"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    ENABLE_METRICS: bool = True
    ENABLE_AUDIT_LOG: bool = True
    LOG_LEVEL: str = "INFO"


settings = Settings()
