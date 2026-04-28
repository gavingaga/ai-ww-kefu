"""Prompt 模板注册表。

模板来源(优先级):
    1. ENV ``AI_HUB_PROMPTS_DIR`` 指向的目录(可热更新,M2 起步只在启动时扫描)
    2. 包内 ``ai_hub/prompts/templates`` 下的内置模板(随构建打包)

文件命名:``<scene>__<version>.md``,首行允许 ``# title`` 元数据,正文为 ``str.format`` 模板。
未配置 ``<scene>`` 时,落到 ``default``;未配置 ``<version>`` 时,选已注册的最大版本。
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PromptTemplate:
    scene: str
    version: int
    title: str
    body: str
    source: str  # "builtin" / "fs:<path>"

    @property
    def id(self) -> str:
        return f"{self.scene}@v{self.version}"


_FILENAME_RE = re.compile(r"^(?P<scene>[a-z0-9_]+)__(?P<ver>\d+)\.md$")


class PromptRegistry:
    """加载并查询 Prompt 模板。"""

    def __init__(self) -> None:
        self._by_scene: dict[str, dict[int, PromptTemplate]] = {}

    def get(self, scene: str | None, version: int | None = None) -> PromptTemplate:
        """按 scene 选模板;无对应 scene 时回落 default。"""
        s = (scene or "default").strip().lower() or "default"
        if s not in self._by_scene:
            s = "default"
        bucket = self._by_scene.get(s) or {}
        if not bucket:
            raise RuntimeError(
                "PromptRegistry: empty,builtin templates 应至少包含 default;请检查打包",
            )
        if version is not None and version in bucket:
            return bucket[version]
        return bucket[max(bucket)]

    def all(self) -> list[PromptTemplate]:
        return [t for bucket in self._by_scene.values() for t in bucket.values()]

    # ────────── 加载 ──────────

    @classmethod
    def from_default(cls) -> "PromptRegistry":
        reg = cls()
        reg._load_builtin()
        path_env = os.getenv("AI_HUB_PROMPTS_DIR")
        if path_env:
            reg._load_dir(Path(path_env))
        if "default" not in reg._by_scene:
            raise RuntimeError("PromptRegistry: missing 'default' scene")
        return reg

    def _load_builtin(self) -> None:
        try:
            pkg = resources.files(__name__).joinpath("templates")
        except (ModuleNotFoundError, FileNotFoundError):
            return
        if not pkg.is_dir():
            return
        for f in pkg.iterdir():
            if not f.is_file() or not f.name.endswith(".md"):
                continue
            m = _FILENAME_RE.match(f.name)
            if not m:
                logger.warning("prompts: skip filename %s", f.name)
                continue
            scene = m.group("scene")
            ver = int(m.group("ver"))
            text = f.read_text(encoding="utf-8")
            title, body = _split_title(text)
            t = PromptTemplate(scene=scene, version=ver, title=title, body=body, source="builtin")
            self._by_scene.setdefault(scene, {})[ver] = t

    def _load_dir(self, dir_: Path) -> None:
        if not dir_.exists():
            logger.warning("prompts: dir not found %s", dir_)
            return
        for f in dir_.iterdir():
            if not f.is_file() or not f.name.endswith(".md"):
                continue
            m = _FILENAME_RE.match(f.name)
            if not m:
                continue
            scene = m.group("scene")
            ver = int(m.group("ver"))
            text = f.read_text(encoding="utf-8")
            title, body = _split_title(text)
            t = PromptTemplate(
                scene=scene, version=ver, title=title, body=body, source=f"fs:{f}"
            )
            self._by_scene.setdefault(scene, {})[ver] = t


def _split_title(text: str) -> tuple[str, str]:
    """首行 ``# 标题`` 视为元数据。"""
    lines = text.splitlines()
    if lines and lines[0].startswith("#"):
        return lines[0].lstrip("# ").strip(), "\n".join(lines[1:]).lstrip("\n")
    return "", text
