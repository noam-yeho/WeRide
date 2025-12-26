from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from app.api.deps import get_current_user
from app.core.database import get_session
from app.models.domain import Convoy, ConvoyCreate, ConvoyRead, ConvoyMember, ConvoyRole, User
from app.core.routing import get_route_geometry
from sqlmodel import SQLModel
import secrets
import string
import uuid

router = APIRouter()

class JoinConvoyRequest(SQLModel):
    invite_code: str

def get_share_link(invite_code: str) -> str:
    return f"weride://convoy/join?code={invite_code}"

def generate_invite_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

@router.post("/", response_model=ConvoyRead)
async def create_convoy(
    convoy_data: ConvoyCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):

    invite_code = generate_invite_code()
    existing_code = await session.execute(select(Convoy).where(Convoy.invite_code == invite_code))
    while existing_code.scalars().first():
        invite_code = generate_invite_code()
        existing_code = await session.execute(select(Convoy).where(Convoy.invite_code == invite_code))

    # FIX 1: Strip timezone info to match DB naive timestamp column
    if convoy_data.start_time and convoy_data.start_time.tzinfo:
        convoy_data.start_time = convoy_data.start_time.replace(tzinfo=None)

    convoy = Convoy(
        invite_code=invite_code,
        **convoy_data.dict()
    )
    session.add(convoy)
    
    # FIX 2: Use explicit convoy_id instead of the object to ensure FK is set correctly
    member = ConvoyMember(
        convoy_id=convoy.id, 
        user_id=current_user.id,
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
    db_convoy = result.scalars().first()
    
    # FIX: Revert to from_orm to correctly handle SQLModel objects
    response = ConvoyRead.from_orm(db_convoy)
    response.share_link = get_share_link(db_convoy.invite_code)
    return response

@router.post("/join", response_model=ConvoyRead)
async def join_convoy(
    join_req: JoinConvoyRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):

    result = await session.execute(
        select(Convoy).where(Convoy.invite_code == join_req.invite_code).options(selectinload(Convoy.members))
    )
    convoy = result.scalars().first()
    if not convoy:
        raise HTTPException(status_code=404, detail="Convoy not found")

    if any(u.id == current_user.id for u in convoy.members):
        # FIX: Revert to from_orm
        response = ConvoyRead.from_orm(convoy)
        response.share_link = get_share_link(convoy.invite_code)
        return response

    member = ConvoyMember(
        convoy_id=convoy.id,
        user_id=current_user.id,
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
    
    # FIX: Revert to from_orm
    response = ConvoyRead.from_orm(final_convoy)
    response.share_link = get_share_link(final_convoy.invite_code)
    return response

@router.get("/mine", response_model=List[ConvoyRead])
async def get_my_convoys(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):

    result = await session.execute(
        select(User).where(User.id == current_user.id).options(selectinload(User.convoys).options(selectinload(Convoy.members)))
    )
    user_with_convoys = result.scalars().first()
    
    response_list = []
    for c in user_with_convoys.convoys:
        # FIX: Revert to from_orm
        c_read = ConvoyRead.from_orm(c)
        c_read.share_link = get_share_link(c.invite_code)
        response_list.append(c_read)
        
    return response_list

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
        
    # FIX: Revert to from_orm
    response = ConvoyRead.from_orm(convoy)
    response.share_link = get_share_link(convoy.invite_code)
    return response

@router.get("/{convoy_id}/route")
async def get_convoy_route(
    convoy_id: uuid.UUID,
    user_lat: float,
    user_lon: float,
    session: AsyncSession = Depends(get_session)
):
    """
    Get the route geometry from user_lat/lon to the convoy's destination.
    """
    result = await session.execute(
        select(Convoy).where(Convoy.id == convoy_id)
    )
    convoy = result.scalars().first()
    if not convoy:
        raise HTTPException(status_code=404, detail="Convoy not found")
        
    if not convoy.destination_lat or not convoy.destination_lon:
        # If no destination set, return empty route
        return {"route": []}

    path, duration, distance = await get_route_geometry(
        user_lat, user_lon, 
        convoy.destination_lat, convoy.destination_lon
    )
    
    return {"route": path, "duration": duration, "distance": distance}

@router.delete("/{convoy_id}")
async def leave_convoy(
    convoy_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    # 1. Find Member Record
    result = await session.execute(
        select(ConvoyMember).where(
            ConvoyMember.convoy_id == convoy_id,
            ConvoyMember.user_id == current_user.id
        )
    )
    member = result.scalars().first()
    
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this convoy")

    # 2. Remove Member
    await session.delete(member)
    await session.commit()

    # 3. Check if convoy is empty
    result = await session.execute(
        select(ConvoyMember).where(ConvoyMember.convoy_id == convoy_id)
    )
    remaining_members = result.scalars().all()

    if not remaining_members:
        # Delete Convoy if empty
        convoy_result = await session.execute(
            select(Convoy).where(Convoy.id == convoy_id)
        )
        convoy = convoy_result.scalars().first()
        if convoy:
            await session.delete(convoy)
            await session.commit()
            return {"status": "success", "message": "Convoy deleted as it became empty"}

    return {"status": "success", "message": "Left convoy"}
