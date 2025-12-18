from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import users, convoys, websockets
from app.core.database import init_db

app = FastAPI(title="WeRide API", version="0.1.0")

# CORS Configuration
# TODO: In production, replace ["*"] with specific domains (e.g., ["https://weride.app"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await init_db()

# Include Routers
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(convoys.router, prefix="/api/v1/convoys", tags=["convoys"])
app.include_router(websockets.router, prefix="/ws", tags=["websockets"])

@app.get("/")
async def root(name: str = "Noam"):
    return {"message": f"WeRide Systems Online ≡ƒתא, Let's go {name}", "status": "active"}

@app.get("/health")
async def health_check():
    return {"db": "connected", "redis": "connected"}