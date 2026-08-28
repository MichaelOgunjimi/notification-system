"""Errors exposed by the tenancy Module interface."""


class TenancyError(Exception):
    """Base error for expected tenancy use-case failures."""


class TenantResourceNotFoundError(TenancyError):
    def __init__(self, resource: str) -> None:
        self.resource = resource
        super().__init__(f"{resource} not found")


class CapabilityDeniedError(TenancyError):
    def __init__(self) -> None:
        super().__init__("Your organization role does not allow this action")


class SlugConflictError(TenancyError):
    def __init__(self, resource: str) -> None:
        self.resource = resource
        if resource == "Organization":
            message = "An organization with this slug already exists"
        else:
            message = "A project with this slug already exists in the organization"
        super().__init__(message)
