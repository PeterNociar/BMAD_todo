"""Task table model and its queries."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Column, DateTime, Text, case
from sqlmodel import Field, Session, SQLModel, col, select


class Task(SQLModel, table=True):
    __tablename__ = "tasks"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    text: str = Field(sa_column=Column(Text, nullable=False))
    added_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    completed_at: datetime | None = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    @classmethod
    def list_ordered(cls, session: Session) -> list[Task]:
        """AD-6 canonical order, done in SQL: open tasks by `added_at` ascending, then
        completed tasks by `completed_at` descending, ties by `id` ascending."""
        completed_at = col(cls.completed_at)
        statement = select(cls).order_by(
            completed_at.is_not(None),
            case((completed_at.is_(None), col(cls.added_at))).asc(),
            completed_at.desc().nulls_last(),
            col(cls.id).asc(),
        )
        return list(session.exec(statement).all())

    @classmethod
    def get_by_id(cls, session: Session, task_id: UUID) -> Task | None:
        statement = select(cls).where(col(cls.id) == task_id)
        return session.exec(statement).first()
