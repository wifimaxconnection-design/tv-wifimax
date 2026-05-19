"""
Auth Service – JWT token issuance, validation, refresh, and revocation.
Subscriber access control via subscription check.
"""
import os
from datetime import datetime, timedelta, timezone
import redis.asyncio as aioredis
import structlog
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pydantic import BaseModel
from pydantic_settings import BaseSettings
from jose import jwt, JWTError
from passlib.context import CryptContext

logger = structlog.get_logger()


class Settings(BaseSettings):
    JWT_SECRET_KEY: str = "change-me-jwt"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    REDIS_URL: str = "redis://redis:6379/1"


settings = Settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
app = FastAPI(title="IPTV Auth Service", version="1.0.0")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

_redis: aioredis.Redis | None = None


async def get_redis():
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60


class TokenValidation(BaseModel):
    valid: bool
    subject: str | None = None
    expires_at: datetime | None = None


def _create_token(subject: str, token_type: str, expire: timedelta) -> str:
    exp = datetime.now(timezone.utc) + expire
    return jwt.encode(
        {"sub": subject, "exp": exp, "type": token_type},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "auth"}


@app.post("/auth/token", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), redis=Depends(get_redis)):
    # In production: look up user in PostgreSQL and verify password hash
    # This placeholder accepts any non-empty credentials for dev
    if not form.username or not form.password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access = _create_token(
        form.username, "access",
        timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh = _create_token(
        form.username, "refresh",
        timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    )
    # Store refresh token in Redis for revocation support
    await redis.setex(
        f"refresh:{form.username}",
        settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        refresh
    )
    return TokenResponse(access_token=access, refresh_token=refresh)


@app.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(token: str, redis=Depends(get_redis)):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    subject = payload["sub"]
    stored = await redis.get(f"refresh:{subject}")
    if stored != token:
        raise HTTPException(status_code=401, detail="Token revoked or expired")

    access = _create_token(subject, "access", timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    new_refresh = _create_token(subject, "refresh", timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS))
    await redis.setex(f"refresh:{subject}", settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400, new_refresh)
    return TokenResponse(access_token=access, refresh_token=new_refresh)


@app.post("/auth/validate", response_model=TokenValidation)
async def validate_token(token: str):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return TokenValidation(
            valid=True,
            subject=payload.get("sub"),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        )
    except JWTError:
        return TokenValidation(valid=False)


@app.post("/auth/revoke")
async def revoke_token(subject: str, redis=Depends(get_redis)):
    await redis.delete(f"refresh:{subject}")
    return {"status": "revoked"}
