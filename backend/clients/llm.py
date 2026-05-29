from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[2]


@dataclass(frozen=True, slots=True)
class LLMSettings:
    api_key: str
    base_url: str = "https://api.longcat.chat/openai"
    model: str = "LongCat-2.0-Preview"
    provider: str = "longcat"
    timeout_seconds: int = 30

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)


@dataclass(frozen=True, slots=True)
class LLMResult:
    used: bool
    model: str
    provider: str
    content: str = ""
    error: str = ""


def load_settings() -> LLMSettings:
    env_file = _read_env_file(ROOT_DIR / ".env")
    return LLMSettings(
        api_key=os.environ.get("LLM_API_KEY")
        or os.environ.get("LONGCAT_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or env_file.get("LLM_API_KEY", "")
        or env_file.get("LONGCAT_API_KEY", ""),
        base_url=_normalize_openai_base_url(
            os.environ.get("LLM_BASE_URL")
            or os.environ.get("LONGCAT_BASE_URL")
            or os.environ.get("OPENAI_BASE_URL")
            or env_file.get("LLM_BASE_URL")
            or env_file.get("LONGCAT_BASE_URL")
            or "https://api.longcat.chat/openai"
        ),
        model=(
            os.environ.get("LLM_MODEL")
            or os.environ.get("LONGCAT_MODEL")
            or os.environ.get("OPENAI_MODEL")
            or env_file.get("LLM_MODEL")
            or env_file.get("LONGCAT_MODEL")
            or "LongCat-2.0-Preview"
        ),
        provider=os.environ.get("LLM_PROVIDER")
        or os.environ.get("LONGCAT_PROVIDER")
        or env_file.get("LLM_PROVIDER")
        or env_file.get("LONGCAT_PROVIDER")
        or "longcat",
    )


def chat_json(
    system_prompt: str,
    user_payload: dict[str, Any],
    temperature: float | None = None,
) -> tuple[dict[str, Any] | None, LLMResult]:
    result = chat_text(
        system_prompt=system_prompt,
        user_content=json.dumps(user_payload, ensure_ascii=False),
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    if not result.used:
        return None, result

    try:
        return json.loads(result.content), result
    except json.JSONDecodeError:
        extracted = _extract_json_object(result.content)
        if extracted is None:
            return None, LLMResult(
                used=False,
                model=result.model,
                provider=result.provider,
                error="Model response was not valid JSON.",
            )
        return extracted, result


def chat_text(
    system_prompt: str,
    user_content: str,
    response_format: dict[str, Any] | None = None,
    temperature: float | None = None,
) -> LLMResult:
    settings = load_settings()
    if not settings.enabled:
        return LLMResult(
            used=False,
            model=settings.model,
            provider=settings.provider,
            error="LLM_API_KEY is not configured.",
        )

    payload: dict[str, Any] = {
        "model": settings.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.35 if temperature is None else temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    request = urllib.request.Request(
        url=f"{settings.base_url}/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=settings.timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if response_format:
            return chat_text(
                system_prompt, user_content, response_format=None, temperature=temperature
            )
        return LLMResult(
            used=False,
            model=settings.model,
            provider=settings.provider,
            error=f"HTTP {exc.code}: {detail[:300]}",
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return LLMResult(
            used=False,
            model=settings.model,
            provider=settings.provider,
            error=str(exc),
        )

    content = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        return LLMResult(
            used=False,
            model=settings.model,
            provider=settings.provider,
            error="Empty model response.",
        )
    return LLMResult(used=True, model=settings.model, provider=settings.provider, content=content)


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _normalize_openai_base_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        normalized = normalized[: -len("/chat/completions")]
    if normalized.endswith("/openai"):
        return f"{normalized}/v1"
    return normalized


def _extract_json_object(text: str) -> dict[str, Any] | None:
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
