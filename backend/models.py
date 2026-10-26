from sqlalchemy import Integer, String, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )
    sku: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
    )
    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )
    price: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )
    stock: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    how_much_sold: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    image_path: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
