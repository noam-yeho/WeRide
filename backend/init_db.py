import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel
import os
from app.models.domain import * # noqa: F403
from dotenv import load_dotenv

load_dotenv()

async def init_db():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set")
        return
    
    print(f"Initializing DB: {database_url}")
    engine = create_async_engine(database_url)
    
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)
    print("Tables created.")

if __name__ == "__main__":
    asyncio.run(init_db())
