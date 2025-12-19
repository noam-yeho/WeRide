from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from app.core.database import get_session
from app.models.domain import Convoy, ConvoyCreate, ConvoyRead, ConvoyMember, ConvoyRole, User
from sqlmodel import SQLModel
import secrets
import string
import uuid

router = APIRouter()

class JoinConvoyRequest(SQLModel):
    invite_code: str
    user_id: int

def generate_invite_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

@router.post("/", response_model=ConvoyRead)
async def create_convoy(
    convoy_data: ConvoyCreate,
    user_id: int = Query(..., description="The ID of the user creating the convoy"),
    session: AsyncSession = Depends(get_session)
):
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    invite_code = generate_invite_code()
    existing_code = await session.execute(select(Convoy).where(Convoy.invite_code == invite_code))
    while existing_code.scalars().first():
        invite_code = generate_invite_code()
        existing_code = await session.execute(select(Convoy).where(Convoy.invite_code == invite_code))

    convoy = Convoy(
        invite_code=invite_code,
        **convoy_data.dict()
    )
    session.add(convoy)
    
    member = ConvoyMember(
        convoy=convoy, 
        user_id=user_id,
        role=ConvoyRole.LEADER
    )
    session.add(member)

    await session.commit()
    await session.refresh(convoy)

    convoy_id = convoy.id
    session.expire(convoy) 
    
    result = await session.execute(
        select(Convoy).where(Convoy.id == convoy_id).options(selectinload(Convoy.members))
    )
    return result.scalars().first()

@router.post("/join", response_model=ConvoyRead)
async def join_convoy(
    join_req: JoinConvoyRequest,
    session: AsyncSession = Depends(get_session)
):
    user_result = await session.execute(select(User).where(User.id == join_req.user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await session.execute(
        select(Convoy).where(Convoy.invite_code == join_req.invite_code).options(selectinload(Convoy.members))
    )
    convoy = result.scalars().first()
    if not convoy:
        raise HTTPException(status_code=404, detail="Convoy not found")

    if any(u.id == join_req.user_id for u in convoy.members):
        return convoy

    member = ConvoyMember(
        convoy_id=convoy.id,
        user_id=join_req.user_id,
        role=ConvoyRole.MEMBER
    )
    session.add(member)
    await session.commit()
    
    convoy_id = convoy.id
    session.expire(convoy)
    result = await session.execute(
        select(Convoy).where(Convoy.id == convoy_id).options(selectinload(Convoy.members))
    )
    final_convoy = result.scalars().first()
    return final_convoy

@router.get("/{convoy_id}", response_model=ConvoyRead)
async def get_convoy(
    convoy_id: uuid.UUID,
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Convoy).where(Convoy.id == convoy_id).options(selectinload(Convoy.members))
    )
    convoy = result.scalars().first()
    if not convoy:
        raise HTTPException(status_code=404, detail="Convoy not found")
    return convoy

@router.get("/user/{user_id}", response_model=List[ConvoyRead])
async def get_user_convoys(
    user_id: int,
    session: AsyncSession = Depends(get_session)
):
    user_result = await session.execute(select(User).where(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await session.execute(
        select(User).where(User.id == user_id).options(selectinload(User.convoys).options(selectinload(Convoy.members)))
    )
    user_with_convoys = result.scalars().first()
    
    return user_with_convoys.convoys