"""Markdown helpers — parsing SKILL.md frontmatter, rendering templates."""

from __future__ import annotations

import re
from typing import Any

import yaml


def parse_skill_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Parse YAML frontmatter from a SKILL.md file.

    Returns (metadata_dict, body_after_frontmatter).
    """
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)", content, re.DOTALL)
    if not match:
        return {}, content

    try:
        meta = yaml.safe_load(match.group(1)) or {}
    except yaml.YAMLError:
        meta = {}

    return meta, match.group(2)


def build_skill_md(
    name: str,
    description: str,
    body: str = "",
    metadata: dict[str, Any] | None = None,
) -> str:
    """Build a SKILL.md string with YAML frontmatter."""
    lines = ["---"]
    lines.append(f"name: {name}")
    lines.append(f"description: {description}")
    if metadata:
        import json

        lines.append(f"metadata: {json.dumps(metadata)}")
    lines.append("---")
    lines.append("")
    if body:
        lines.append(body)
    return "\n".join(lines) + "\n"
