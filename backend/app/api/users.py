from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.models.domain import User, UserCreate, UserRead
from sqlalchemy.future import select
from app.core.security import get_password_hash

router = APIRouter()

@router.post("/signup", response_model=UserRead)
async def signup(user: UserCreate, session: AsyncSession = Depends(get_session)):
    # Check if username exists
    result = await session.execute(select(User).where(User.username == user.username))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Check if phone exists
    result_phone = await session.execute(select(User).where(User.phone_number == user.phone_number))
    existing_phone = result_phone.scalars().first()
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    # Prepare user data
    user_data = user.dict()
    password = user_data.pop("password")
    user_data["hashed_password"] = get_password_hash(password)
    db_user = User(**user_data)
    session.add(db_user)
    await session.commit()
    await session.refresh(db_user)
    return db_user
