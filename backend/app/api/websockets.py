from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.socket_manager import manager

router = APIRouter()

@router.websocket("/{convoy_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, convoy_id: str, user_id: str):
    await manager.connect(convoy_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            lat = data.get("lat")
            lon = data.get("lon")
            
            # FIX: Basic Validation - ignore updates with missing coordinates
            if lat is None or lon is None:
                continue

            await manager.broadcast_location(
                convoy_id=convoy_id,
                sender_id=user_id,
                lat=lat,
                lon=lon,
                sender_socket=websocket # FIX: Pass current socket to exclude from broadcast
            )
            
    except WebSocketDisconnect:
        manager.disconnect(convoy_id, websocket)
    except Exception as e:
        print(f"Error in websocket connection: {e}")
        manager.disconnect(convoy_id, websocket)