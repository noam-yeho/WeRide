from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel

class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    phone_number: str = Field(index=True, unique=True)
    full_name: Optional[str] = None

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserCreate(UserBase):
    pass

class UserRead(UserBase):
    id: int
    created_at: datetime
