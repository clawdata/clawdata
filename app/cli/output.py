"""Rich formatting utilities for CLI output."""

from __future__ import annotations

from typing import Any

import click


# ── Colours and symbols ───────────────────────────────────────────────
OK = click.style("✓", fg="green")
FAIL = click.style("✗", fg="red")
WARN = click.style("!", fg="yellow")
BULLET = click.style("•", fg="cyan")
ARROW = click.style("→", fg="blue")
DIM = "bright_black"


def header(text: str) -> None:
    """Print a section header."""
    click.echo()
    click.secho(f"  {text}", fg="cyan", bold=True)
    click.secho(f"  {'─' * len(text)}", fg=DIM)


def success(text: str) -> None:
    click.echo(f"  {OK} {text}")


def error(text: str) -> None:
    click.echo(f"  {FAIL} {click.style(text, fg='red')}")


def warn(text: str) -> None:
    click.echo(f"  {WARN} {text}")


def info(text: str) -> None:
    click.echo(f"  {BULLET} {text}")


def kv(key: str, value: Any, indent: int = 4) -> None:
    """Print a key-value pair."""
    pad = " " * indent
    click.echo(f"{pad}{click.style(key + ':', fg=DIM)} {value}")


def table(headers: list[str], rows: list[list[Any]], indent: int = 4) -> None:
    """Render a simple aligned table."""
    if not rows:
        click.echo(f"{' ' * indent}(no results)")
        return

    # Calculate column widths
    all_rows = [headers] + rows
    widths = [max(len(str(cell)) for cell in col) for col in zip(*all_rows)]

    pad = " " * indent
    # Header
    hdr = "  ".join(click.style(str(h).ljust(w), fg=DIM, bold=True) for h, w in zip(headers, widths))
    click.echo(f"{pad}{hdr}")
    click.echo(f"{pad}{'  '.join('─' * w for w in widths)}")
    # Rows
    for row in rows:
        line = "  ".join(str(cell).ljust(w) for cell, w in zip(row, widths))
        click.echo(f"{pad}{line}")


# ── Interactive selection helpers ─────────────────────────────────────


def pick(
    items: list[dict],
    *,
    label_key: str = "name",
    id_key: str = "id",
    prompt: str = "Select",
    show_back: bool = True,
    extra_actions: list[tuple[str, str]] | None = None,
) -> tuple[str, dict | None]:
    """Show a numbered list and let the user pick one.

    Returns (action, item):
      - ("select", item_dict) when user picks an item
      - ("back", None) when user picks [b]ack
      - (custom_key, None) for extra_actions
    """
    click.echo()
    for i, item in enumerate(items, 1):
        num = click.style(f"  {i:>3}", fg="cyan", bold=True)
        label = item.get(label_key, item.get(id_key, f"item-{i}"))
        desc = item.get("description", "")
        extra = item.get("_extra", "")
        line = f"{num}  {label}"
        if extra:
            line += f"  {click.style(extra, fg=DIM)}"
        elif desc:
            line += f"  {click.style(desc[:50], fg=DIM)}"
        click.echo(line)

    # Extra actions
    actions = []
    if extra_actions:
        click.echo()
        for key, label in extra_actions:
            actions.append((key, label))
            click.echo(f"    {click.style(f'[{key}]', fg='yellow')} {label}")
    if show_back:
        actions.append(("b", "Back"))
        click.echo(f"    {click.style('[b]', fg='yellow')} Back")

    click.echo()
    while True:
        raw = click.prompt(
            click.style(f"  {prompt}", fg="cyan"),
            default="b" if show_back else "1",
        )
        raw = raw.strip().lower()

        # Check action keys
        for key, _ in actions:
            if raw == key.lower():
                return key, None

        # Check number
        try:
            idx = int(raw) - 1
            if 0 <= idx < len(items):
                return "select", items[idx]
        except ValueError:
            pass

        error(f"Invalid choice: {raw}")


def pick_action(
    actions: list[tuple[str, str]],
    *,
    prompt: str = "What would you like to do?",
) -> str:
    """Show a menu of actions and return the chosen key.

    actions: list of (key, label) tuples, e.g. [("deploy", "Deploy skill"), ...]
    """
    click.echo()
    for i, (key, label) in enumerate(actions, 1):
        num = click.style(f"  {i:>3}", fg="cyan", bold=True)
        click.echo(f"{num}  {label}")

    click.echo()
    while True:
        raw = click.prompt(click.style(f"  {prompt}", fg="cyan"))
        raw = raw.strip().lower()

        # Match by number
        try:
            idx = int(raw) - 1
            if 0 <= idx < len(actions):
                return actions[idx][0]
        except ValueError:
            pass

        # Match by key
        for key, _ in actions:
            if raw == key.lower():
                return key

        error(f"Invalid choice: {raw}")


def checklist(
    items: list[dict],
    *,
    label_key: str = "name",
    id_key: str = "id",
    checked: set[str] | None = None,
    prompt: str = "Skills",
) -> list[dict]:
    """Show an interactive multi-select checklist.

    Use ↑/↓ to navigate, Space to toggle, Enter to confirm.
    Returns the list of selected items.
    """
    from simple_term_menu import TerminalMenu

    # Build display labels
    labels = []
    for item in items:
        label = item.get(label_key, item.get(id_key, "?"))
        desc = item.get("description", "")
        if desc:
            labels.append(f"{label}  — {desc[:50]}")
        else:
            labels.append(label)

    # Pre-select items that are already checked
    preselected = None
    if checked:
        preselected = [
            i for i, item in enumerate(items)
            if item.get(id_key) in checked
        ]

    menu = TerminalMenu(
        labels,
        title=f"  {prompt}  (↑↓ navigate, Space toggle, Enter confirm)",
        multi_select=True,
        show_multi_select_hint=True,
        multi_select_select_on_accept=False,
        multi_select_empty_ok=True,
        preselected_entries=preselected,
    )

    menu.show()
    chosen = menu.chosen_menu_indices

    if chosen is None:
        return []

    return [items[i] for i in chosen]


def confirm(text: str) -> bool:
    """Simple y/n confirmation."""
    return click.confirm(click.style(f"  {text}", fg="cyan"), default=False)
