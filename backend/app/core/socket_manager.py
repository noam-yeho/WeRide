from typing import Dict, List, Optional
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Dict[convoy_id, List[WebSocket]]
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, convoy_id: str, websocket: WebSocket):
        await websocket.accept()
        if convoy_id not in self.active_connections:
            self.active_connections[convoy_id] = []
        self.active_connections[convoy_id].append(websocket)
        print(f"DEBUG: WebSocket connected to convoy {convoy_id}")

    def disconnect(self, convoy_id: str, websocket: WebSocket):
        if convoy_id in self.active_connections:
            if websocket in self.active_connections[convoy_id]:
                self.active_connections[convoy_id].remove(websocket)
            if not self.active_connections[convoy_id]:
                del self.active_connections[convoy_id]
        print(f"DEBUG: WebSocket disconnected from convoy {convoy_id}")

    async def broadcast_location(self, convoy_id: str, sender_id: str, lat: float, lon: float, sender_socket: Optional[WebSocket] = None):
        """
        Broadcast location to all connected drivers in the convoy, excluding the sender.
        """
        if convoy_id not in self.active_connections:
            return
            
        message = {
            "type": "location_update",
            "user_id": sender_id,
            "lat": lat,
            "lon": lon
        }
        
        # FIX: Iterate over a copy of the list (list(...)) to avoid RuntimeError if a connection drops during iteration
        for connection in list(self.active_connections[convoy_id]):
            # FIX: Self-Echo prevention - don't send the message back to the sender
            if sender_socket and connection == sender_socket:
                continue
                
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error broadcasting to client: {e}")
                # Optional: We could call disconnect() here if the error indicates a broken pipe

manager = ConnectionManager()