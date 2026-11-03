"""Text normalisation (VALIDATION_SPEC §1)."""

from __future__ import annotations

import re
import unicodedata

_CONTROL_SINGLE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # tab/newline/CR count as whitespace
_CONTROL_MULTI = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")  # "\n" is allowed in multiline fields
_SURROGATE = re.compile(r"[\ud800-\udfff]")
_WS = re.compile(r"\s+")


class TextError(ValueError):
    """Carries a machine code from the VALIDATION_SPEC §11 catalogue."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def clean_single_line(value: str) -> str:
    """NFC, trim, collapse whitespace; reject control characters and unpaired surrogates."""
    if _SURROGATE.search(value):
        raise TextError("invalid_format", "Contains invalid characters.")
    value = unicodedata.normalize("NFC", value)
    if _CONTROL_SINGLE.search(value):
        raise TextError("invalid_format", "Contains control characters.")
    return _WS.sub(" ", value.replace("\N{NO-BREAK SPACE}", " ")).strip()


def clean_multiline(value: str) -> str:
    """NFC, trim, normalise newlines; `\\n` is allowed, other control characters are not."""
    if _SURROGATE.search(value):
        raise TextError("invalid_format", "Contains invalid characters.")
    value = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")
    if _CONTROL_MULTI.search(value):
        raise TextError("invalid_format", "Contains control characters.")
    return value.strip()


def normalise_name(value: str) -> str:
    """Comparison form for organisation and skill names."""
    return _WS.sub(" ", unicodedata.normalize("NFKC", value)).strip().casefold()
