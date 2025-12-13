from fastapi import FastAPI

app = FastAPI(title="WeRide API", version="0.1.0")

@app.get("/")
async def root(name_to_print: str):
    return {"message": f"WeRide Systems Online 🚀, Let`s go {name_to_print}", "status": "active"}

@app.get("/health")
async def health_check():
    return {"db": "connected", "redis": "connected"}