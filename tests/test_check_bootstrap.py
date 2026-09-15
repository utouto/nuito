from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check-bootstrap.py"
SPEC = importlib.util.spec_from_file_location("check_bootstrap", SCRIPT)
assert SPEC and SPEC.loader
check_bootstrap = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check_bootstrap)


class CheckBootstrapTest(unittest.TestCase):
    def test_pristine_requires_every_template_marker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path, markers in check_bootstrap.TEMPLATE_MARKERS.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\n".join(markers), encoding="utf-8")

            with patch.object(check_bootstrap, "ROOT", root):
                self.assertTrue(check_bootstrap.template_is_pristine())
                (root / "README.md").write_text("initialized", encoding="utf-8")
                self.assertFalse(check_bootstrap.template_is_pristine())

    def test_pristine_rejects_application_work_with_markers_untouched(self) -> None:
        for application_path, is_directory in (
            ("package.json", False),
            ("src", True),
        ):
            with self.subTest(application_path=application_path):
                with tempfile.TemporaryDirectory() as directory:
                    root = Path(directory)
                    for relative_path, markers in check_bootstrap.TEMPLATE_MARKERS.items():
                        path = root / relative_path
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text("\n".join(markers), encoding="utf-8")
                    path = root / application_path
                    if is_directory:
                        path.mkdir()
                    else:
                        path.write_text("{}", encoding="utf-8")

                    with patch.object(check_bootstrap, "ROOT", root):
                        self.assertFalse(check_bootstrap.template_is_pristine())

    def test_pristine_rejects_unknown_root_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path, markers in check_bootstrap.TEMPLATE_MARKERS.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\n".join(markers), encoding="utf-8")
            (root / "backend").mkdir()

            with patch.object(check_bootstrap, "ROOT", root):
                self.assertFalse(check_bootstrap.template_is_pristine())

    def test_empty_required_field_is_reported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path in check_bootstrap.REQUIRED_FILES:
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("", encoding="utf-8")

            with patch.object(check_bootstrap, "ROOT", root):
                issues = check_bootstrap.collect_issues()

            self.assertIn(
                "missing bootstrap field: docs/product/product-brief.md: 対象利用者",
                issues,
            )
            self.assertIn(
                "empty required file: docs/product/product-brief.md",
                issues,
            )

    def test_requirements_source_and_priority_method_are_required(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path in check_bootstrap.REQUIRED_FILES:
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("initialized", encoding="utf-8")

            with patch.object(check_bootstrap, "ROOT", root):
                issues = check_bootstrap.collect_issues()

            self.assertIn(
                "missing bootstrap field: docs/management/delivery-governance.md: "
                "要求の正本と優先順位の決定方法",
                issues,
            )

    def test_placeholder_and_whitespace_values_are_rejected(self) -> None:
        self.assertTrue(check_bootstrap.field_is_placeholder(" TBD "))
        self.assertTrue(check_bootstrap.field_is_placeholder("未定。"))
        self.assertFalse(
            check_bootstrap.field_is_placeholder("対象外（UIを提供しないため）")
        )

        self.assertEqual(
            "",
            check_bootstrap.field_value("- 対象利用者:   ", "対象利用者"),
        )

    def test_placeholder_value_is_reported_by_bootstrap_check(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path in check_bootstrap.REQUIRED_FILES:
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                fields = check_bootstrap.REQUIRED_FIELDS.get(relative_path, ())
                contents = [f"- {field}: project-specific decision" for field in fields]
                path.write_text("\n".join(contents) or "initialized", encoding="utf-8")
            product_brief = root / "docs/product/product-brief.md"
            product_brief.write_text(
                product_brief.read_text(encoding="utf-8").replace(
                    "- 対象利用者: project-specific decision",
                    "- 対象利用者: TBD",
                ),
                encoding="utf-8",
            )

            with patch.object(check_bootstrap, "ROOT", root):
                issues = check_bootstrap.collect_issues()

            self.assertIn(
                "placeholder bootstrap field: "
                "docs/product/product-brief.md: 対象利用者: TBD",
                issues,
            )

    def test_ci_rejects_partially_initialized_project(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path, markers in check_bootstrap.TEMPLATE_MARKERS.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\n".join(markers), encoding="utf-8")
            (root / "README.md").write_text("initialized", encoding="utf-8")

            with (
                patch.object(check_bootstrap, "ROOT", root),
                patch.object(sys, "argv", [str(SCRIPT), "--ci"]),
                redirect_stdout(StringIO()),
            ):
                self.assertEqual(1, check_bootstrap.main())

    def test_ci_rejects_application_work_with_markers_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative_path, markers in check_bootstrap.TEMPLATE_MARKERS.items():
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\n".join(markers), encoding="utf-8")
            (root / "package.json").write_text("{}", encoding="utf-8")

            with (
                patch.object(check_bootstrap, "ROOT", root),
                patch.object(sys, "argv", [str(SCRIPT), "--ci"]),
                redirect_stdout(StringIO()),
            ):
                self.assertEqual(1, check_bootstrap.main())

    def test_completed_project_has_no_bootstrap_issues(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fields_by_file: dict[str, list[str]] = {}
            for relative_path, fields in check_bootstrap.REQUIRED_FIELDS.items():
                fields_by_file[relative_path] = [
                    f"- {field}: project-specific decision" for field in fields
                ]

            for relative_path in check_bootstrap.REQUIRED_FILES:
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                contents = fields_by_file.get(relative_path, ["initialized"])
                path.write_text("\n".join(contents), encoding="utf-8")

            with patch.object(check_bootstrap, "ROOT", root):
                self.assertEqual([], check_bootstrap.collect_issues())
                self.assertFalse(check_bootstrap.template_is_pristine())


if __name__ == "__main__":
    unittest.main()
