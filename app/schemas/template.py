"""Template schemas — lightweight file listing only.

v2: Templates are browsed directly from the filesystem.
No DB-backed CRUD or Jinja rendering.
"""

from pydantic import BaseModel


class TemplateFileEntry(BaseModel):
    """A file or folder in the templates directory tree."""

    name: str
    path: str
    type: str  # "file" | "folder"
    size: int | None = None
    children: list["TemplateFileEntry"] = []


class TemplateBrowseResponse(BaseModel):
    root: str
    tree: list[TemplateFileEntry]

