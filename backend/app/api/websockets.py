from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.socket_manager import manager
from app.core.database import get_session
from app.models.domain import Convoy
import uuid

router = APIRouter()

@router.websocket("/{convoy_id}/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    convoy_id: str, 
    user_id: str,
    session: AsyncSession = Depends(get_session)
):
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