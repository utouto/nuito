#!/usr/bin/env python3
"""第三者packageを使わず、repository管理下のtemplate metadataを検証する。"""

from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def repository_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [ROOT / path.decode() for path in result.stdout.split(b"\0") if path]


def validate_json(files: list[Path], errors: list[str]) -> None:
    for path in sorted(path for path in files if path.suffix == ".json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            errors.append(f"invalid JSON: {path.relative_to(ROOT)}: {error}")


def validate_toml(files: list[Path], errors: list[str]) -> None:
    for path in sorted(path for path in files if path.suffix == ".toml"):
        try:
            tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
            errors.append(f"invalid TOML: {path.relative_to(ROOT)}: {error}")


def validate_agent_definitions(errors: list[str]) -> None:
    agents_directory = ROOT / ".codex" / "agents"
    allowed_sandbox_modes = {"read-only", "workspace-write", "danger-full-access"}
    for path in sorted(agents_directory.glob("*.toml")):
        try:
            config = tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError):
            continue

        expected_name = path.stem.replace("-", "_")
        if config.get("name") != expected_name:
            errors.append(
                f"agent name mismatch: {path.relative_to(ROOT)} "
                f"(expected {expected_name!r}, got {config.get('name')!r})"
            )
        if not config.get("description"):
            errors.append(f"missing agent description: {path.relative_to(ROOT)}")
        if config.get("sandbox_mode") not in allowed_sandbox_modes:
            errors.append(f"invalid agent sandbox_mode: {path.relative_to(ROOT)}")

        instructions = config.get("developer_instructions")
        if not isinstance(instructions, str) or not instructions.strip():
            errors.append(f"missing agent developer_instructions: {path.relative_to(ROOT)}")
            continue
        if "AGENTS.md" not in instructions:
            errors.append(f"agent does not reference AGENTS.md: {path.relative_to(ROOT)}")

        for reference in re.findall(r"\.agents/skills/[A-Za-z0-9_./-]+", instructions):
            if not (ROOT / reference.rstrip(".,:;）)")).exists():
                errors.append(
                    f"broken agent skill reference: {path.relative_to(ROOT)} -> {reference}"
                )


def validate_python(files: list[Path], errors: list[str]) -> None:
    for path in sorted(path for path in files if path.suffix == ".py"):
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, UnicodeDecodeError, SyntaxError) as error:
            errors.append(f"invalid Python: {path.relative_to(ROOT)}: {error}")


def validate_markdown_links(files: list[Path], errors: list[str]) -> None:
    link_pattern = re.compile(r"!?\[[^]]*]\(([^)]+)\)")
    for path in sorted(path for path in files if path.suffix == ".md"):
        text = path.read_text(encoding="utf-8")
        for target in link_pattern.findall(text):
            target = target.strip().strip("<>")
            if not target or target.startswith("#") or "://" in target:
                continue
            local_target = target.split("#", 1)[0]
            if local_target and not (path.parent / local_target).resolve().exists():
                errors.append(
                    f"broken local link: {path.relative_to(ROOT)} -> {target}"
                )


def validate_skills(errors: list[str]) -> None:
    for path in sorted((ROOT / ".agents" / "skills").glob("*/SKILL.md")):
        text = path.read_text(encoding="utf-8")
        match = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
        if not match:
            errors.append(f"missing YAML frontmatter: {path.relative_to(ROOT)}")
            continue
        fields: dict[str, str] = {}
        for line in match.group(1).splitlines():
            key, separator, value = line.partition(":")
            if separator:
                fields[key.strip()] = value.strip()
        expected_name = path.parent.name
        if fields.get("name") != expected_name:
            errors.append(
                f"skill name mismatch: {path.relative_to(ROOT)} "
                f"(expected {expected_name!r}, got {fields.get('name')!r})"
            )
        if not fields.get("description"):
            errors.append(f"missing skill description: {path.relative_to(ROOT)}")


def validate_devcontainer(errors: list[str]) -> None:
    config_path = ROOT / ".devcontainer" / "devcontainer.json"
    lock_path = ROOT / ".devcontainer" / "devcontainer-lock.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    lock = json.loads(lock_path.read_text(encoding="utf-8"))

    dockerfile = config.get("build", {}).get("dockerfile")
    if not dockerfile or not (config_path.parent / dockerfile).is_file():
        errors.append("devcontainer build.dockerfile does not reference an existing file")

    configured_features = set(config.get("features", {}))
    locked_features = set(lock.get("features", {}))
    if configured_features != locked_features:
        errors.append(
            "devcontainer feature lock mismatch: "
            f"configured={sorted(configured_features)}, locked={sorted(locked_features)}"
        )

    for user_field in ("remoteUser", "containerUser"):
        if config.get(user_field) != "root":
            errors.append(f"devcontainer {user_field} must default to root")

    mounts = config.get("mounts", [])
    if not any("target=/root/.codex" in mount for mount in mounts):
        errors.append("devcontainer must persist Codex data under /root/.codex")

    for mount in mounts:
        if "target=/root/.config/gh" in mount:
            errors.append("devcontainer must not persist GitHub CLI credentials by default")

    codex_config = tomllib.loads(
        (ROOT / ".codex" / "config.toml").read_text(encoding="utf-8")
    )
    if codex_config.get("approval_policy") != "never":
        errors.append("Codex approval_policy must default to never")

    dockerfile_text = (config_path.parent / "Dockerfile").read_text(encoding="utf-8")
    first_instruction = next(
        (line.strip() for line in dockerfile_text.splitlines() if line.strip()), ""
    )
    if not re.fullmatch(r"FROM\s+\S+@sha256:[0-9a-f]{64}", first_instruction):
        errors.append("devcontainer base image must be pinned by sha256 digest")
    if "package-lock.json" not in dockerfile_text or "npm ci" not in dockerfile_text:
        errors.append("devcontainer tools must be installed from package-lock.json with npm ci")

    tools_directory = config_path.parent / "tools"
    tools_package = json.loads(
        (tools_directory / "package.json").read_text(encoding="utf-8")
    )
    tools_lock = json.loads(
        (tools_directory / "package-lock.json").read_text(encoding="utf-8")
    )
    declared_dependencies = tools_package.get("dependencies", {})
    locked_dependencies = tools_lock.get("packages", {}).get("", {}).get(
        "dependencies", {}
    )
    if declared_dependencies != locked_dependencies:
        errors.append("devcontainer tool package.json and package-lock.json disagree")
    for dependency, version in declared_dependencies.items():
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
            errors.append(
                f"devcontainer tool must use an exact version: {dependency}@{version}"
            )


def validate_github_actions(files: list[Path], errors: list[str]) -> None:
    workflows = sorted(
        path for path in files if path.parent == ROOT / ".github" / "workflows"
    )
    if not workflows:
        errors.append("missing GitHub Actions workflow")
        return

    uses_pattern = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)", re.MULTILINE)
    pinned_action = re.compile(r"^[^/\s]+/[^@\s]+@[0-9a-f]{40}$")
    workflow_run_steps: list[str] = []
    for path in workflows:
        text = path.read_text(encoding="utf-8")
        workflow_run_steps.extend(
            match.group(1).strip()
            for match in re.finditer(
                r"^\s*(?:-\s*)?run:\s*([^\r\n]+)$", text, re.MULTILINE
            )
        )
        if not re.search(r"^\s*permissions:\s*$", text, re.MULTILINE):
            errors.append(f"workflow lacks explicit permissions: {path.relative_to(ROOT)}")
        for action in uses_pattern.findall(text):
            if action.startswith("./") or action.startswith("docker://"):
                continue
            if not pinned_action.fullmatch(action):
                errors.append(
                    f"GitHub Action is not pinned to a commit SHA: "
                    f"{path.relative_to(ROOT)} -> {action}"
                )

    all_run_steps = "\n".join(workflow_run_steps)
    required_commands = (
        "python3 scripts/validate-template.py",
        "python3 -m unittest discover",
        "python3 scripts/check-bootstrap.py --ci",
    )
    for command in required_commands:
        if command not in all_run_steps:
            errors.append(f"GitHub Actions does not run required command: {command}")


def validate_github_templates(errors: list[str]) -> None:
    required_sections = {
        ".github/ISSUE_TEMPLATE/bug_report.md": (
            "## 修正の受け入れ条件",
            "## 対象範囲・非対象",
        ),
        ".github/ISSUE_TEMPLATE/feature_request.md": (
            "## 受け入れ条件",
            "## 優先順位の判断材料",
        ),
        ".github/pull_request_template.md": ("## 関連Issue・要求",),
    }
    for relative_path, sections in required_sections.items():
        path = ROOT / relative_path
        if not path.is_file():
            errors.append(f"missing GitHub template: {relative_path}")
            continue
        text = path.read_text(encoding="utf-8")
        for section in sections:
            if section not in text:
                errors.append(f"missing GitHub template section: {relative_path}: {section}")


def validate_secrets(files: list[Path], errors: list[str]) -> None:
    patterns = {
        "AWS access key": re.compile("AKIA" + r"[0-9A-Z]{16}"),
        "GitHub token": re.compile("gh" + r"[pousr]_[A-Za-z0-9]{20,}"),
        "OpenAI-style key": re.compile("sk" + r"-[A-Za-z0-9]{20,}"),
        "private key": re.compile("-----BEGIN " + r"(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    }
    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for label, pattern in patterns.items():
            if pattern.search(text):
                errors.append(f"possible {label}: {path.relative_to(ROOT)}")


def main() -> int:
    errors: list[str] = []
    files = repository_files()
    validate_json(files, errors)
    validate_toml(files, errors)
    validate_agent_definitions(errors)
    validate_python(files, errors)
    validate_markdown_links(files, errors)
    validate_skills(errors)
    validate_devcontainer(errors)
    validate_github_actions(files, errors)
    validate_github_templates(errors)
    validate_secrets(files, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Template validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
