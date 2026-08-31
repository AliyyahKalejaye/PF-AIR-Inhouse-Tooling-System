"""Import every model here so Base.metadata sees all tables — this is what
Alembic's autogenerate (and our hand-written initial migration) relies on.
"""

from app.db.base import Base
from app.models.bom import BOM, BOMItem, BOMItemStatus
from app.models.component import Category, Component
from app.models.ecr import ECRStatus, EngineeringChangeRequest
from app.models.notification import Notification, NotificationReceipt, NotificationType
from app.models.project import MediaType, MILItem, Project, ProjectMedia, ProjectStatus
from app.models.user import User, UserRole

__all__ = [
    "Base",
    "User",
    "UserRole",
    "Category",
    "Component",
    "BOM",
    "BOMItem",
    "BOMItemStatus",
    "Project",
    "ProjectStatus",
    "ProjectMedia",
    "MediaType",
    "MILItem",
    "Notification",
    "NotificationReceipt",
    "NotificationType",
    "EngineeringChangeRequest",
    "ECRStatus",
]
