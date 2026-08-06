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

    def test_markdown_crlf_front_matter_is_not_content(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "slides.md"
            path.write_bytes(b"---\r\nmarp: true\r\ntheme: default\r\n---\r\n# Process\r\n\r\nA process owns an address space.\r\n")
            document = normalize_file(path, "test-markdown")
        content = "\n".join(item["text"] for item in document["blocks"])
        self.assertNotIn("marp", content)
        self.assertNotIn("theme:", content)
        self.assertIn("address space", content)

    def test_rst_parses_heading_note_and_code_without_directives(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trap.rst"
            path.write_text(
                "Trap 入口\n=========\n\n.. note::\n\n   stvec 保存入口地址。\n\n.. code-block:: rust\n\n   fn trap() {\n       save_context();\n   }\n",
                encoding="utf-8",
            )
            document = normalize_file(path, "test-rst")
        content = "\n".join(item["text"] for item in document["blocks"])
        self.assertEqual(document["format"], "rst")
        self.assertEqual([item["type"] for item in document["blocks"]], ["heading", "paragraph", "code"])
        self.assertNotIn("code-block", content)
        self.assertIn("    save_context();", document["blocks"][-1]["text"])

    def test_numbered_code_line_is_not_a_heading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "extract.txt"
            path.write_text("5 #include <stdio.h>\n6 int main(void) {\n7 return 0;\n8 }\n", encoding="utf-8")
            document = normalize_file(path, "test-text")
        self.assertFalse(any(item["type"] == "heading" for item in document["blocks"]))
        self.assertIn("#include", document["blocks"][0]["text"])

    def test_pdf_style_bit_positions_are_not_headings_but_decimal_sections_are(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "extract.txt"
            path.write_text("31 25 24 20 19 15 14 12 11 7 6 0\n\n2.1 特权级切换\n\n系统调用会触发特权级切换。\n", encoding="utf-8")
            document = normalize_file(path, "test-text")
        headings = [item["text"] for item in document["blocks"] if item["type"] == "heading"]
        self.assertEqual(headings, ["2.1 特权级切换"])
        self.assertEqual(document["blocks"][0]["type"], "paragraph")

    def test_equations_and_wrapped_chapter_sentences_are_not_headings(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "extract.txt"
            path.write_text(
                "29.51 𝐵 𝑖𝑛𝑠𝑡𝑟𝑢𝑐𝑡𝑖𝑜𝑛𝑠 0.72 𝑐𝑙𝑜𝑐𝑘\n\n"
                "第八章介绍了向量扩展 RV32V，当与其他指令相比时会发现差异。\n\n"
                "8.2 向量寄存器\n\n向量寄存器保存多个数据元素。\n",
                encoding="utf-8",
            )
            document = normalize_file(path, "test-text")
        headings = [item["text"] for item in document["blocks"] if item["type"] == "heading"]
        self.assertEqual(headings, ["8.2 向量寄存器"])

    def test_chapter_question_is_recognized_as_a_heading(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "extract.txt"
            path.write_text(
                "第一章 为什么要有 RISC-V？\n\nRISC-V 的目标是成为一个通用的指令集架构。\n",
                encoding="utf-8",
            )
            document = normalize_file(path, "test-text")
        self.assertEqual(document["blocks"][0]["type"], "heading")
        self.assertEqual(document["blocks"][1]["sectionPath"], ["第一章 为什么要有 RISC-V？"])

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

    def test_multi_document_yaml_keeps_each_concept(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "concepts.yaml"
            path.write_text("id: os.trap\nname: Trap\n---\nid: os.scheduler\nname: Scheduler\n", encoding="utf-8")
            document = normalize_file(path, "test-yaml-stream")
        self.assertEqual(len(document["blocks"]), 2)
        self.assertIn("os.trap", document["blocks"][0]["text"])
        self.assertIn("os.scheduler", document["blocks"][1]["text"])
        self.assertEqual(document["blocks"][1]["locator"]["document"], 2)

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
