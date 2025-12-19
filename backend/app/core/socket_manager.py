from typing import Dict, List
from fastapi import WebSocket
from app.core.routing import get_driving_distance

class ConnectionManager:
    def __init__(self):
        # Active sockets: {convoy_id: [socket1, socket2]}
        self.active_connections: Dict[str, List[WebSocket]] = {}
        
        # Convoy Destinations: {convoy_id: {"lat": x, "lon": y}}
        self.convoy_destinations: Dict[str, Dict[str, float]] = {}
        
        # User States: {convoy_id: {user_id: {"lat": x, "lon": y, "rank": 1, "distance": 100}}}
        self.convoy_state: Dict[str, Dict[str, dict]] = {}

    async def connect(self, convoy_id: str, websocket: WebSocket):
        await websocket.accept()
        if convoy_id not in self.active_connections:
            self.active_connections[convoy_id] = []
        self.active_connections[convoy_id].append(websocket)

    def set_destination(self, convoy_id: str, lat: float, lon: float):
        self.convoy_destinations[convoy_id] = {"lat": lat, "lon": lon}

    def disconnect(self, convoy_id: str, websocket: WebSocket, user_id: str):
        if convoy_id in self.active_connections:
            if websocket in self.active_connections[convoy_id]:
                self.active_connections[convoy_id].remove(websocket)
            
            # Remove user from state on disconnect
            if convoy_id in self.convoy_state and user_id in self.convoy_state[convoy_id]:
                del self.convoy_state[convoy_id][user_id]
                
            if not self.active_connections[convoy_id]:
                del self.active_connections[convoy_id]
                # Clean up memory
                if convoy_id in self.convoy_destinations:
                    del self.convoy_destinations[convoy_id]
                if convoy_id in self.convoy_state:
                    del self.convoy_state[convoy_id]

    async def update_location_and_broadcast(self, convoy_id: str, user_id: str, lat: float, lon: float):
        # 1. Update User Location
        if convoy_id not in self.convoy_state:
            self.convoy_state[convoy_id] = {}
            
        if user_id not in self.convoy_state[convoy_id]:
             self.convoy_state[convoy_id][user_id] = {}

        self.convoy_state[convoy_id][user_id].update({
             "lat": lat,
             "lon": lon
        })

        # 2. Calculate Distance if destination exists
        dest = self.convoy_destinations.get(convoy_id)
        if dest:
            distance = await get_driving_distance(lat, lon, dest["lat"], dest["lon"])
            if distance is not None:
                self.convoy_state[convoy_id][user_id]["distance"] = distance

        # 3. Rank members
        members_with_distance = [
            (uid, data) 
            for uid, data in self.convoy_state[convoy_id].items() 
            if "distance" in data
        ]
        
        # Sort by distance ascending (closest first)
        members_with_distance.sort(key=lambda x: x[1]["distance"])

        ranked_members = []
        for rank, (uid, data) in enumerate(members_with_distance, 1):
            data["rank"] = rank
            ranked_members.append({
                "user_id": uid,
                "lat": data["lat"],
                "lon": data["lon"],
                "rank": rank,
                "distance": data["distance"]
            })

        if not dest:
            # Fallback
             message = {
                "type": "location_update",
                "user_id": user_id,
                "lat": lat,
                "lon": lon
            }
        else:
            message = {
                "type": "convoy_update",
                "members": ranked_members
            }

        # 4. Broadcast
        if convoy_id in self.active_connections:
            for connection in list(self.active_connections[convoy_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass