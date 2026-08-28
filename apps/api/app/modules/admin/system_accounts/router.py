"""Scoped internal system-account management endpoints."""

import uuid

from fastapi import APIRouter, Response, status

from app.core.http.dependencies import SessionDep
from app.modules.admin.dependencies import SystemAccountsManageDep
from app.modules.admin.system_accounts.schemas import (
    CreatedSystemCredentialResponse,
    SystemAccountCreate,
    SystemAccountResponse,
    SystemAccountUpdate,
    SystemCredentialCreate,
    SystemCredentialResponse,
)
from app.modules.admin.system_accounts.service import (
    create_system_account,
    create_system_credential,
    list_system_accounts,
    list_system_credentials,
    revoke_system_credential,
    update_system_account,
)

router = APIRouter(prefix="/admin/system-accounts", tags=["admin-system-accounts"])


@router.get("", response_model=list[SystemAccountResponse])
async def get_system_accounts(
    db: SessionDep,
    _: SystemAccountsManageDep,
) -> list[SystemAccountResponse]:
    accounts = await list_system_accounts(db)
    return [SystemAccountResponse.model_validate(account) for account in accounts]


@router.post("", response_model=SystemAccountResponse, status_code=status.HTTP_201_CREATED)
async def add_system_account(
    body: SystemAccountCreate,
    db: SessionDep,
    actor: SystemAccountsManageDep,
) -> SystemAccountResponse:
    account = await create_system_account(
        db,
        actor=actor,
        name=body.name,
        slug=body.slug,
        description=body.description,
    )
    return SystemAccountResponse.model_validate(account)


@router.patch("/{system_account_id}", response_model=SystemAccountResponse)
async def edit_system_account(
    system_account_id: uuid.UUID,
    body: SystemAccountUpdate,
    db: SessionDep,
    actor: SystemAccountsManageDep,
) -> SystemAccountResponse:
    account = await update_system_account(
        db,
        actor=actor,
        system_account_id=system_account_id,
        changes=body.model_dump(exclude_unset=True),
    )
    return SystemAccountResponse.model_validate(account)


@router.get(
    "/{system_account_id}/credentials",
    response_model=list[SystemCredentialResponse],
)
async def get_system_credentials(
    system_account_id: uuid.UUID,
    db: SessionDep,
    _: SystemAccountsManageDep,
) -> list[SystemCredentialResponse]:
    credentials = await list_system_credentials(db, system_account_id=system_account_id)
    return [SystemCredentialResponse.model_validate(item) for item in credentials]


@router.post(
    "/{system_account_id}/credentials",
    response_model=CreatedSystemCredentialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_system_credential(
    system_account_id: uuid.UUID,
    body: SystemCredentialCreate,
    db: SessionDep,
    actor: SystemAccountsManageDep,
) -> CreatedSystemCredentialResponse:
    credential, raw_key = await create_system_credential(
        db,
        actor=actor,
        system_account_id=system_account_id,
        name=body.name,
        permissions=[permission.value for permission in body.permissions],
    )
    return CreatedSystemCredentialResponse(
        **SystemCredentialResponse.model_validate(credential).model_dump(),
        key=raw_key,
    )


@router.delete(
    "/{system_account_id}/credentials/{credential_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_system_credential(
    system_account_id: uuid.UUID,
    credential_id: uuid.UUID,
    db: SessionDep,
    actor: SystemAccountsManageDep,
) -> Response:
    await revoke_system_credential(
        db,
        actor=actor,
        system_account_id=system_account_id,
        credential_id=credential_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
