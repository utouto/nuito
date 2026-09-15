from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate-template.py"
SPEC = importlib.util.spec_from_file_location("validate_template", SCRIPT)
assert SPEC and SPEC.loader
validate_template = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validate_template)


class ValidateTemplateTest(unittest.TestCase):
    def test_unpinned_action_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workflow = root / ".github" / "workflows" / "ci.yml"
            workflow.parent.mkdir(parents=True)
            workflow.write_text(
                "permissions:\n  contents: read\nsteps:\n"
                "  - uses: actions/checkout@v4\n"
                "  - run: python3 scripts/validate-template.py\n"
                "  - run: python3 -m unittest discover\n"
                "  - run: python3 scripts/check-bootstrap.py --ci\n",
                encoding="utf-8",
            )
            errors: list[str] = []
            with patch.object(validate_template, "ROOT", root):
                validate_template.validate_github_actions([workflow], errors)

            self.assertEqual(1, len(errors))
            self.assertIn("not pinned", errors[0])

    def test_required_ci_command_cannot_be_removed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workflow = root / ".github" / "workflows" / "ci.yml"
            workflow.parent.mkdir(parents=True)
            workflow.write_text(
                "permissions:\n  contents: read\nsteps:\n"
                "  - run: python3 scripts/validate-template.py\n"
                "  - run: python3 -m unittest discover\n",
                encoding="utf-8",
            )
            errors: list[str] = []
            with patch.object(validate_template, "ROOT", root):
                validate_template.validate_github_actions([workflow], errors)

            self.assertIn(
                "GitHub Actions does not run required command: "
                "python3 scripts/check-bootstrap.py --ci",
                errors,
            )

    def test_required_ci_command_in_comment_does_not_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workflow = root / ".github" / "workflows" / "ci.yml"
            workflow.parent.mkdir(parents=True)
            workflow.write_text(
                "permissions:\n  contents: read\nsteps:\n"
                "  # python3 scripts/validate-template.py\n"
                "  # python3 -m unittest discover\n"
                "  # python3 scripts/check-bootstrap.py --ci\n",
                encoding="utf-8",
            )
            errors: list[str] = []
            with patch.object(validate_template, "ROOT", root):
                validate_template.validate_github_actions([workflow], errors)

            self.assertEqual(3, len(errors))

    def test_required_github_template_section_is_checked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            required_templates = {
                ".github/ISSUE_TEMPLATE/bug_report.md": "## 対象範囲・非対象",
                ".github/ISSUE_TEMPLATE/feature_request.md": (
                    "## 受け入れ条件\n## 優先順位の判断材料"
                ),
                ".github/pull_request_template.md": "## 関連Issue・要求",
            }
            for relative_path, contents in required_templates.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(contents, encoding="utf-8")

            errors: list[str] = []
            with patch.object(validate_template, "ROOT", root):
                validate_template.validate_github_templates(errors)

            self.assertEqual(1, len(errors))
            self.assertIn("## 修正の受け入れ条件", errors[0])

    def test_agent_name_must_match_filename(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            agent = root / ".codex" / "agents" / "test-reviewer.toml"
            agent.parent.mkdir(parents=True)
            agent.write_text(
                'name = "wrong"\n'
                'description = "review"\n'
                'sandbox_mode = "read-only"\n'
                'developer_instructions = "AGENTS.md"\n',
                encoding="utf-8",
            )
            errors: list[str] = []
            with patch.object(validate_template, "ROOT", root):
                validate_template.validate_agent_definitions(errors)

            self.assertTrue(any("name mismatch" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
