"""Template browsing CLI — interactive-first.

`clawdata templates`       → interactive folder/file browser
`clawdata templates browse` → non-interactive tree
"""

from __future__ import annotations

from pathlib import Path

import click

from app.cli.output import error, header, info, kv, pick, pick_action, warn


# ═══════════════════════════════════════════════════════════════════════
# Interactive flow — `clawdata templates`
# ═══════════════════════════════════════════════════════════════════════


@click.group("templates", invoke_without_command=True)
@click.pass_context
def templates_group(ctx):
    """Browse project templates — interactive browser when run without a subcommand."""
    if ctx.invoked_subcommand is not None:
        return
    _interactive_templates()


def _interactive_templates():
    """Interactive template folder browser."""
    from app.config import settings

    base = settings.templates_dir
    if not base.exists() or not base.is_dir():
        error(f"Templates directory not found: {base}")
        return

    _browse_dir(base, base)


def _browse_dir(root: Path, current: Path):
    """Recursively browse a directory interactively."""
    while True:
        entries = sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
        entries = [e for e in entries if not e.name.startswith(".") and e.name != "__pycache__"]

        if not entries:
            info("Empty directory")
            return

        rel = current.relative_to(root) if current != root else Path(".")
        header(f"Templates: {rel}")

        items = []
        for e in entries:
            if e.is_dir():
                child_count = len([c for c in e.iterdir() if not c.name.startswith(".")])
                items.append({
                    "id": e.name,
                    "name": click.style(f"📁 {e.name}/", fg="blue", bold=True),
                    "description": f"{child_count} items",
                    "_path": e,
                    "_is_dir": True,
                })
            else:
                items.append({
                    "id": e.name,
                    "name": f"📄 {e.name}",
                    "description": _human_size(e.stat().st_size),
                    "_path": e,
                    "_is_dir": False,
                })

        action, item = pick(
            items,
            label_key="name",
            prompt="Select (#) or [b]ack",
        )

        if action in ("back", "b"):
            return

        if action == "select" and item:
            path = item["_path"]
            if item["_is_dir"]:
                _browse_dir(root, path)
            else:
                _show_file(path, root)


def _show_file(path: Path, root: Path):
    """Display a file's content with actions."""
    rel = path.relative_to(root)
    header(f"File: {rel}")
    kv("Size", _human_size(path.stat().st_size))
    click.echo()

    content = path.read_text(errors="replace")
    lines = content.splitlines()

    # Show first 30 lines
    preview_count = min(30, len(lines))
    for i, line in enumerate(lines[:preview_count], 1):
        lineno = click.style(f"{i:4d}", fg="bright_black")
        click.echo(f"  {lineno} │ {line}")

    if len(lines) > preview_count:
        click.secho(f"\n    ... ({len(lines) - preview_count} more lines)", fg="bright_black")

    if len(lines) > preview_count:
        click.echo()
        action = pick_action(
            [
                ("full", "Show full content"),
                ("back", "← Back"),
            ],
            prompt="Action",
        )

        if action == "full":
            click.echo()
            for i, line in enumerate(lines, 1):
                lineno = click.style(f"{i:4d}", fg="bright_black")
                click.echo(f"  {lineno} │ {line}")
            click.echo()


# ═══════════════════════════════════════════════════════════════════════
# Non-interactive subcommands
# ═══════════════════════════════════════════════════════════════════════


@templates_group.command("browse")
@click.option("--path", "sub_path", default=None, help="Sub-directory to browse")
def browse_templates(sub_path: str | None):
    """Browse the templates directory tree (non-interactive)."""
    from app.config import settings

    base = settings.templates_dir
    if sub_path:
        base = base / sub_path

    if not base.exists() or not base.is_dir():
        error(f"Directory not found: {base}")
        return

    header(f"Templates: {base}")
    _print_tree(base, base, indent=0)
    click.echo()


def _print_tree(root: Path, current: Path, indent: int = 0):
    """Recursively print a directory tree."""
    entries = sorted(current.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    for i, entry in enumerate(entries):
        if entry.name.startswith(".") or entry.name == "__pycache__":
            continue
        is_last = i == len(entries) - 1
        prefix = "    " * indent
        connector = "└── " if is_last else "├── "

        if entry.is_dir():
            click.echo(f"{prefix}{connector}{click.style(entry.name + '/', fg='blue', bold=True)}")
            _print_tree(root, entry, indent + 1)
        else:
            size = entry.stat().st_size
            size_str = _human_size(size)
            click.echo(f"{prefix}{connector}{entry.name}  {click.style(size_str, fg='bright_black')}")


@templates_group.command("show")
@click.argument("path")
def show_template(path: str):
    """Show the contents of a template file (non-interactive)."""
    from app.config import settings

    safe = Path(path)
    if ".." in safe.parts:
        error("Invalid path")
        return

    full = settings.templates_dir / safe
    if not full.exists() or not full.is_file():
        error(f"File not found: {path}")
        return

    header(f"Template: {path}")
    click.echo()
    content = full.read_text(errors="replace")
    for i, line in enumerate(content.splitlines(), 1):
        lineno = click.style(f"{i:4d}", fg="bright_black")
        click.echo(f"  {lineno} │ {line}")
    click.echo()


def _human_size(size: int) -> str:
    """Format bytes as human-readable size."""
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.0f}{unit}" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}TB"