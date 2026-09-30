"""Task table model and its queries."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, Text
from sqlmodel import Field, Session, SQLModel, select


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    text: str = Field(sa_column=Column(Text, nullable=False))
    added_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    completed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    @classmethod
    def list_all(cls, session: Session) -> list[Task]:
        return list(session.exec(select(cls)).all())
