from fastapi import FastAPI
from app.api import users, convoys
from app.core.database import init_db

app = FastAPI(title="WeRide API", version="0.1.0")

@app.on_event("startup")
async def on_startup():
    await init_db()

app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(convoys.router, prefix="/api/v1/convoys", tags=["convoys"])

@app.get("/")
async def root(name: str = "Noam"):
    return {"message": f"WeRide Systems Online 🚀, Let`s go {name}", "status": "active"}

@app.get("/health")
async def health_check():
    return {"db": "connected", "redis": "connected"}