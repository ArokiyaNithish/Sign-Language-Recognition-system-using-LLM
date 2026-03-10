# ════════════════════════════════════════════
# SignBridge — auth/models.py
# SQLAlchemy User model
# ════════════════════════════════════════════

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from auth.database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    full_name  = Column(String(120), nullable=False)
    email      = Column(String(255), unique=True, index=True, nullable=False)
    hashed_pw  = Column(String(255), nullable=False)
    is_active  = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<User id={self.id} email={self.email}>"
