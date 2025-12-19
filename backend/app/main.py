from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import users, convoys, websockets, auth

app = FastAPI(title="WeRide API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(convoys.router, prefix="/api/v1/convoys", tags=["convoys"])
app.include_router(websockets.router, prefix="/ws", tags=["websockets"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

@app.get("/")
async def root(name: str = "Noam"):
    return {"message": f"WeRide Systems Online ≡ƒתא, Let's go {name}", "status": "active"}

@app.get("/health")
async def health_check():
    return {"db": "connected", "redis": "connected"}