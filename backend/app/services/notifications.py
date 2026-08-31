"""Notification-creation helpers, called from the route handlers that
cause the events the notification feed covers (component out-of-stock /
low-stock / deleted; project created / status-changed / deleted; ECR
submitted / decided / implemented).

Most of this app has no per-user ownership or watcher model — no "my
projects", no components assigned to a specific engineer — so there's no
natural per-user target for most of these events, and they broadcast to
every user. ECR assignment is the exception (see app/models/notification.py's
Notification.target_user_id docstring): notify_ecr_submitted targets the
assigned approver when one was picked, and notify_ecr_decided targets the
requester, since a review outcome is squarely that one person's business,
not a whole-team broadcast. app/models/notification.py's NotificationReceipt
tracks per-user read state separately either way.

`create_notification` only flushes, it never commits — every call site
here runs inside a route that's already about to commit its own change
(the quantity update, the project delete, ...), so the notification row
rides along in that same transaction instead of being a separate
round-trip that could succeed or fail independently of the change it's
describing.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.component import Component
from app.models.ecr import ECRStatus, EngineeringChangeRequest
from app.models.notification import Notification, NotificationType
from app.models.project import Project, ProjectStatus


async def create_notification(
    db: AsyncSession,
    *,
    type: NotificationType,
    title: str,
    message: str,
    link: str | None = None,
    target_user_id: uuid.UUID | None = None,
) -> Notification:
    notification = Notification(
        type=type, title=title, message=message, link=link, target_user_id=target_user_id
    )
    db.add(notification)
    await db.flush()
    return notification


def _stock_state(quantity: int, low_stock_threshold: int) -> str:
    if quantity <= 0:
        return "out"
    if quantity <= low_stock_threshold:
        return "low"
    return "ok"


async def notify_on_stock_change(db: AsyncSession, component: Component, old_quantity: int) -> None:
    """Edge-triggered, not level-triggered: fires only when the
    component's stock *state* (ok / low / out) actually changes, so a
    component that's already out of stock doesn't re-notify on every
    subsequent PATCH that leaves it out of stock. Call this after
    mutating `component.quantity` but before `db.commit()`."""
    old_state = _stock_state(old_quantity, component.low_stock_threshold)
    new_state = _stock_state(component.quantity, component.low_stock_threshold)
    if new_state == old_state:
        return

    if new_state == "out":
        await create_notification(
            db,
            type=NotificationType.component_out_of_stock,
            title="Component out of stock",
            message=f"{component.name} is now out of stock.",
            link="/inventory",
        )
    elif new_state == "low":
        await create_notification(
            db,
            type=NotificationType.component_low_stock,
            title="Component low on stock",
            message=(
                f"{component.name} has {component.quantity} left "
                f"(threshold {component.low_stock_threshold})."
            ),
            link="/inventory",
        )


async def notify_component_deleted(db: AsyncSession, component: Component) -> None:
    await create_notification(
        db,
        type=NotificationType.component_deleted,
        title="Component deleted",
        message=f"{component.name} was removed from inventory.",
        link="/inventory",
    )


async def notify_project_created(db: AsyncSession, project: Project) -> None:
    await create_notification(
        db,
        type=NotificationType.project_created,
        title="New project created",
        message=f"{project.title} was added.",
        link=f"/projects/{project.id}",
    )


async def notify_project_status_changed(
    db: AsyncSession, project: Project, old_status: ProjectStatus
) -> None:
    if project.status == old_status:
        return
    await create_notification(
        db,
        type=NotificationType.project_status_changed,
        title="Project status changed",
        message=f"{project.title} is now {project.status.value.replace('_', ' ')}.",
        link=f"/projects/{project.id}",
    )


async def notify_project_deleted(db: AsyncSession, project: Project) -> None:
    await create_notification(
        db,
        type=NotificationType.project_deleted,
        title="Project deleted",
        message=f"{project.title} was deleted.",
        link="/projects",
    )


async def notify_ecr_submitted(db: AsyncSession, ecr: EngineeringChangeRequest) -> None:
    """Targeted at ecr.assigned_approver_id when the requester tagged
    someone (that person sees "needs your review" specifically — they're
    also the only one who can actually approve/reject it, see
    api/routes/ecr.py's _require_tagged_approver); falls back to a
    broadcast so an untagged request is at least visible to everyone,
    even though nobody can act on it until it's tagged."""
    targeted = ecr.assigned_approver_id is not None
    await create_notification(
        db,
        type=NotificationType.ecr_submitted,
        title="Change request needs your review" if targeted else "New engineering change request",
        message=f"{ecr.title} is awaiting review.",
        link=f"/ecr/{ecr.id}",
        target_user_id=ecr.assigned_approver_id,
    )


async def notify_ecr_decided(db: AsyncSession, ecr: EngineeringChangeRequest) -> None:
    """Call after setting status to approved/rejected but before commit —
    same edge-triggered shape as notify_project_status_changed, just
    without an old-status check since approve/reject routes only ever
    move a submitted ECR forward, never re-fire on an already-decided one.

    Targeted at the requester (ecr.requested_by) rather than broadcast —
    the outcome of a review is that person's business specifically, not
    something the whole team needs pushed at them."""
    decisions = {
        ECRStatus.approved: (
            NotificationType.ecr_approved,
            "Your change request was approved",
            "approved",
        ),
        ECRStatus.rejected: (
            NotificationType.ecr_rejected,
            "Your change request was rejected",
            "rejected",
        ),
    }
    decision = decisions.get(ecr.status)
    if decision is None:
        return
    notification_type, title, verb = decision
    await create_notification(
        db,
        type=notification_type,
        title=title,
        message=f"{ecr.title} was {verb}.",
        link=f"/ecr/{ecr.id}",
        target_user_id=ecr.requested_by,
    )


async def notify_ecr_implemented(db: AsyncSession, ecr: EngineeringChangeRequest) -> None:
    await create_notification(
        db,
        type=NotificationType.ecr_implemented,
        title="Change request implemented",
        message=f"{ecr.title} has been implemented.",
        link=f"/ecr/{ecr.id}",
    )
