"""Secondary email address management and link-based verification."""

import uuid

from fastapi import APIRouter, Response, status

from app.core.http.dependencies import RedisDep, SessionDep
from app.modules.identity.dependencies import CurrentUserDep
from app.modules.identity.schemas import (
    EmailAddressCreate,
    EmailAddressResponse,
    EmailVerifyRequest,
)
from app.modules.identity.service import (
    add_user_email,
    list_user_emails,
    remove_user_email,
    resend_email_verification,
    set_primary_email,
    verify_email_address,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me/emails", response_model=list[EmailAddressResponse])
async def get_my_emails(user: CurrentUserDep, db: SessionDep):
    return await list_user_emails(db, user=user)


@router.post(
    "/me/emails",
    response_model=EmailAddressResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_my_email(
    body: EmailAddressCreate,
    user: CurrentUserDep,
    db: SessionDep,
    redis: RedisDep,
):
    return await add_user_email(db, redis, user=user, email=body.email)


@router.post("/me/emails/{email_id}/resend", status_code=status.HTTP_202_ACCEPTED)
async def resend_my_email_verification(
    email_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
    redis: RedisDep,
) -> Response:
    await resend_email_verification(db, redis, user=user, email_address_id=email_id)
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/me/emails/{email_id}/primary", response_model=EmailAddressResponse)
async def make_my_email_primary(
    email_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
):
    return await set_primary_email(db, user=user, email_address_id=email_id)


@router.delete("/me/emails/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_my_email(
    email_id: uuid.UUID,
    user: CurrentUserDep,
    db: SessionDep,
) -> Response:
    await remove_user_email(db, user=user, email_address_id=email_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/emails/verify", response_model=EmailAddressResponse)
async def verify_my_email(body: EmailVerifyRequest, db: SessionDep, redis: RedisDep):
    return await verify_email_address(db, redis, token=body.token)
