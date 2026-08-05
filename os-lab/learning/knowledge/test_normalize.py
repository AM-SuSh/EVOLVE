import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from normalize import normalize_file


class NormalizeTest(unittest.TestCase):
    def test_markdown_preserves_sections_code_and_locators(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "lesson.md"
            path.write_text(
                "# Trap\n\n说明 sscratch 与栈。\n\n## 入口\n\n```rust\ncsrrw sp, sscratch, sp\n```\n",
                encoding="utf-8",
            )
            document = normalize_file(path, "test-markdown")
        self.assertEqual(document["format"], "markdown")
        # Code identifiers are intentionally counted by the detector, so this
        # teaching fragment is mixed Chinese/English rather than zh-CN-only.
        self.assertEqual(document["language"], "mixed")
        self.assertEqual([item["type"] for item in document["blocks"]], ["heading", "paragraph", "heading", "code"])
        self.assertEqual(document["blocks"][-1]["language"], "rust")
        self.assertEqual(document["blocks"][-1]["locator"]["lineStart"], 7)
        self.assertEqual(document["blocks"][-1]["sectionPath"], ["Trap", "入口"])

    def test_html_removes_navigation_and_keeps_anchor(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guide.html"
            path.write_text(
                '<html><head><title>Guide</title></head><body><nav>Menu</nav>'
                '<main><h1 id="trap">Trap</h1><p>ecall enters the kernel.</p>'
                '<pre><code>ecall</code></pre></main><script>bad()</script></body></html>',
                encoding="utf-8",
            )
            document = normalize_file(path, "test-html", source_url="https://example.test/guide")
        self.assertEqual(document["title"], "Guide")
        self.assertNotIn("Menu", "\n".join(item["text"] for item in document["blocks"]))
        self.assertEqual(document["blocks"][0]["locator"]["anchor"], "trap")
        self.assertEqual(document["blocks"][-1]["type"], "code")

    def test_structured_json_and_yaml_are_preserved_as_structured_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            json_path = Path(directory) / "concept.json"
            yaml_path = Path(directory) / "concept.yaml"
            json_path.write_text(json.dumps({"id": "os.trap", "signals": ["ecall", "stvec"]}), encoding="utf-8")
            yaml_path.write_text("id: os.trap\nsignals:\n  - ecall\n  - stvec\n", encoding="utf-8")
            json_document = normalize_file(json_path, "test-json")
            yaml_document = normalize_file(yaml_path, "test-yaml")
        self.assertEqual(json_document["blocks"][0]["type"], "structured")
        self.assertEqual(yaml_document["blocks"][0]["type"], "structured")
        self.assertIn("stvec", yaml_document["blocks"][0]["text"])

    def test_epub_uses_spine_order_and_docx_keeps_heading_structure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            epub_path = root / "lesson.epub"
            with zipfile.ZipFile(epub_path, "w") as archive:
                archive.writestr("META-INF/container.xml", '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf"/></rootfiles></container>')
                archive.writestr("OEBPS/package.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>OS EPUB</dc:title></metadata><manifest><item id="c1" href="c1.xhtml"/></manifest><spine><itemref idref="c1"/></spine></package>')
                archive.writestr("OEBPS/c1.xhtml", '<html><body><main><h1>Trap</h1><p>stvec 指向入口。</p></main></body></html>')
            epub = normalize_file(epub_path, "test-epub")
            self.assertEqual(epub["format"], "epub")
            self.assertEqual(epub["title"], "OS EPUB")
            self.assertIn("stvec", epub["blocks"][-1]["text"])

            docx_path = root / "lesson.docx"
            with zipfile.ZipFile(docx_path, "w") as archive:
                archive.writestr("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>页表</w:t></w:r></w:p><w:p><w:r><w:t>Sv39 使用三级页表。</w:t></w:r></w:p></w:body></w:document>')
            docx = normalize_file(docx_path, "test-docx")
            self.assertEqual(docx["format"], "docx")
            self.assertEqual(docx["blocks"][0]["type"], "heading")
            self.assertEqual(docx["blocks"][1]["sectionPath"], ["页表"])


if __name__ == "__main__":
    unittest.main()
