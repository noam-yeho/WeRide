from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt, JWTError
from sqlmodel import select
from app.core.socket_manager import manager
from app.core.database import get_session
from app.core.security import SECRET_KEY, ALGORITHM
from app.models.domain import Convoy, User
import uuid

router = APIRouter()

async def get_user_from_token(token: str, session: AsyncSession) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
        
    statement = select(User).where(User.username == username)
    result = await session.execute(statement)
    user = result.scalars().first()
    return user

@router.websocket("/{convoy_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    convoy_id: str, 
    token: str = Query(...),
    session: AsyncSession = Depends(get_session)
):
    user = await get_user_from_token(token, session)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Use user.id from the validated token
    user_id = str(user.id)

    await manager.connect(convoy_id, websocket)
    
    try:
        # Initialize destination if not present in memory
        if convoy_id not in manager.convoy_destinations:
            try:
                convoy_uuid = uuid.UUID(convoy_id)
                convoy = await session.get(Convoy, convoy_uuid)
                
                if convoy:
                    manager.set_destination(convoy_id, convoy.destination_lat, convoy.destination_lon)
            except Exception:
                # In production, consider logging this error properly
                pass

        while True:
            data = await websocket.receive_json()
            
            lat = data.get("lat")
            lon = data.get("lon")
            
            if lat is None or lon is None:
                continue

            await manager.update_location_and_broadcast(
                convoy_id=convoy_id,
                user_id=user_id,
                lat=lat,
                lon=lon
            )
            
    except WebSocketDisconnect:
        manager.disconnect(convoy_id, websocket, user_id)
    except Exception:
        manager.disconnect(convoy_id, websocket, user_id)