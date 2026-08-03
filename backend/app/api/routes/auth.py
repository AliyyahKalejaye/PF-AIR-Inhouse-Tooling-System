from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.rate_limit import rate_limiter
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    MessageResponse,
    Token,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Signup: 5/hour/IP — generous for a real new hire, tight enough to blunt
# scripted account-spam. Login: 10/5min/IP — loose enough that someone
# fumbling their password a few times isn't locked out, tight enough to
# make brute-forcing a password impractical. Change-password: 10/hour/IP —
# this one requires a valid token already, so it's a smaller attack
# surface than login, but still worth capping since a stolen/leaked token
# shouldn't let an attacker hammer the current-password check.
_signup_rate_limit = rate_limiter("signup", limit=5, window_seconds=3600)
_login_rate_limit = rate_limiter("login", limit=10, window_seconds=300)
_change_password_rate_limit = rate_limiter("change-password", limit=10, window_seconds=3600)


@router.post(
    "/signup",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_signup_rate_limit)],
)
async def signup(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> User:
    existing = await db.execute(
        select(User).where((User.email == payload.email) | (User.staff_id == payload.staff_id))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or staff ID already exists.",
        )

    user = User(
        name=payload.name,
        email=payload.email,
        staff_id=payload.staff_id,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=Token, dependencies=[Depends(_login_rate_limit)])
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Token:
    # OAuth2PasswordRequestForm's "username" field carries the email —
    # the frontend's login form (screen 3) just posts email + password.
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=str(user.id))
    return Token(access_token=access_token)


@router.get("/me", response_model=UserRead)
async def read_current_user(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_current_user(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    current_user.name = payload.name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post(
    "/change-password",
    response_model=MessageResponse,
    dependencies=[Depends(_change_password_rate_limit)],
)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )
    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return MessageResponse(message="Password updated successfully.")
