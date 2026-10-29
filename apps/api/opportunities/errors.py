"""Domain errors raised by the workflow service and mapped to HTTP/admin messages by callers."""

from __future__ import annotations

FieldErrors = dict[str, list[tuple[str, str]]]


class WorkflowError(Exception):
    """A refused operation. `code` is from EDITORIAL_WORKFLOW §6 / VALIDATION_SPEC §11."""

    http_status = 400

    def __init__(self, code: str, message: str = "", *, fields: FieldErrors | None = None) -> None:
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.fields = fields or {}


class ValidationFailed(WorkflowError):
    http_status = 400

    def __init__(self, fields: FieldErrors, message: str = "The content is not valid.") -> None:
        super().__init__("validation_failed", message, fields=fields)


class SlugTaken(ValidationFailed):
    """The requested web address belongs to another listing, now or in the past (D-47): HTTP 409."""

    http_status = 409


class PermissionDeniedError(WorkflowError):
    http_status = 403

    def __init__(self, code: str = "permission_denied", message: str = "You may not do this.") -> None:
        super().__init__(code, message)


class SeparationOfDuties(PermissionDeniedError):
    def __init__(self, message: str = "You cannot review or verify work you authored or submitted.") -> None:
        super().__init__("separation_of_duties", message)


class InvalidTransition(WorkflowError):
    http_status = 409

    def __init__(self, message: str = "That action is not available in the current state.") -> None:
        super().__init__("invalid_transition", message)


class StateConflict(WorkflowError):
    http_status = 409

    def __init__(self, message: str = "The listing changed; reload and try again.") -> None:
        super().__init__("state_conflict", message)


class NotFoundError(WorkflowError):
    http_status = 404

    def __init__(self, message: str = "Not found.") -> None:
        super().__init__("not_found", message)
