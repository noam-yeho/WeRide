from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List
import uuid
from sqlmodel import Field, SQLModel, Relationship

def utc_now():
    """Returns a naive UTC datetime (compatible with postgres timestamp without timezone)"""
    return datetime.now(timezone.utc).replace(tzinfo=None)

class UserBase(SQLModel):
    username: str = Field(index=True, unique=True)
    phone_number: str = Field(index=True, unique=True)
    full_name: Optional[str] = None

class ConvoyRole(str, Enum):
    LEADER = "leader"
    MEMBER = "member"

class ConvoyMember(SQLModel, table=True):
    convoy_id: uuid.UUID = Field(foreign_key="convoy.id", primary_key=True)
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    role: ConvoyRole
    joined_at: datetime = Field(default_factory=utc_now) # Updated

class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=utc_now) # Updated
    
    convoys: List["Convoy"] = Relationship(back_populates="members", link_model=ConvoyMember)

class Convoy(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    invite_code: str = Field(unique=True, index=True)
    destination_name: str
    destination_lat: float
    destination_lon: float
    start_time: datetime
    status: str = "active"
    
    members: List[User] = Relationship(back_populates="convoys", link_model=ConvoyMember)

class UserCreate(UserBase):
    password: str

class UserRead(UserBase):
    id: int
    created_at: datetime

class ConvoyCreate(SQLModel):
    name: str
    destination_name: str
    destination_lat: float
    destination_lon: float
    start_time: Optional[datetime] = None

class ConvoyRead(ConvoyCreate):
    id: uuid.UUID
    invite_code: str
    status: str
    members: List[UserRead]