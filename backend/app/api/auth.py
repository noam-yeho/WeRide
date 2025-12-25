from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.database import get_session
from app.core.security import create_access_token, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from app.models.domain import User

router = APIRouter()

@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session)
):
    statement = select(User).where(User.username == form_data.username)
    result = await session.execute(statement)
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/guest")
async def guest_login(session: AsyncSession = Depends(get_session)):
    import uuid
    from app.core.security import get_password_hash
    
    # 1. Generate unique guest credentials
    guest_uuid = uuid.uuid4().hex
    username = f"guest_{guest_uuid[:8]}"
    password = uuid.uuid4().hex  # Strong random password
    
    # 2. Create Guest User
    guest_user = User(
        username=username,
        hashed_password=get_password_hash(password),
        is_guest=True
    )
    session.add(guest_user)
    await session.commit()
    await session.refresh(guest_user)
    
    # 3. Generate Token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": guest_user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}
