import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from normalize import normalize_file
from quality_filter import clean_text, filter_chunk_set, filter_document


class QualityFilterTest(unittest.TestCase):
    def test_removes_template_urls_and_numeric_noise(self):
        document = {
            "sourceId": "learningos-os-lectures-source",
            "metadata": {"sourcePath": "slides.md"},
            "blocks": [
                {"id": "b0", "ordinal": 0, "type": "paragraph", "text": '{"versionNonce": 1, "strokeSharpness": 0.5}', "sectionPath": [], "locator": {}},
                {"id": "b1", "ordinal": 1, "type": "paragraph", "text": "31 25 24 20 19 15 14 12 11 7 6 0", "sectionPath": [], "locator": {}},
                {"id": "b2", "ordinal": 2, "type": "paragraph", "text": "https://example.com/docs", "sectionPath": [], "locator": {}},
                {"id": "b3", "ordinal": 3, "type": "paragraph", "text": "进程切换时，内核保存当前上下文并恢复下一进程的寄存器状态。", "sectionPath": ["进程调度"], "locator": {}},
                {"id": "b4", "ordinal": 4, "type": "paragraph", "text": "8.9 向量扩展 ................................ 81", "sectionPath": [], "locator": {}},
            ],
        }
        filtered, report = filter_document(document)
        self.assertEqual(len(filtered["blocks"]), 1)
        self.assertIn("上下文", filtered["blocks"][0]["text"])
        self.assertEqual(report["droppedBlocks"], 4)
        self.assertEqual(report["reasons"]["table-of-contents"], 1)

    def test_gitbook_markup_is_removed_but_technical_text_remains(self):
        text = "{% hint style=\"info\" %}页表把虚拟地址映射到物理页框。[扩展阅读](https://example.com){% endhint %}"
        cleaned = clean_text(text)
        self.assertNotIn("{%", cleaned)
        self.assertNotIn("http", cleaned)
        self.assertIn("页表", cleaned)
        self.assertIn("扩展阅读", cleaned)

    def test_platform_concepts_are_projected_to_semantic_blocks(self):
        workspace_root = Path(__file__).resolve().parents[3]
        files = sorted((workspace_root / "os-lab" / "lab-packages").glob("lab[2-8]/concepts/*.yaml"))
        self.assertTrue(files, "expected Lab2-Lab8 concept specifications")
        total = 0
        texts = []
        for path in files:
            document = normalize_file(path, "platform-lab-packages")
            document["metadata"]["sourcePath"] = path.relative_to(workspace_root).as_posix()
            projected, _ = filter_document(document)
            total += len(projected["blocks"])
            texts.extend(item["text"] for item in projected["blocks"])
            self.assertTrue(all(item["locator"].get("conceptId") for item in projected["blocks"]))
        joined = "\n".join(texts)
        self.assertEqual(total, 20)
        self.assertNotIn("source_anchors:", joined)
        self.assertNotIn("practice_tasks:", joined)
        self.assertIn("Sv39", joined)
        self.assertIn("39 位", joined)
        self.assertIn("VPN2|VPN1|VPN0", joined)

    def test_chunk_filter_deduplicates_and_blocks_answer_risk(self):
        base = {
            "id": "doc:chunk-0", "ordinal": 0, "documentId": "doc", "text": "虚拟内存通过页表提供进程隔离。",
            "chunkType": "text", "answerRisk": "low", "metadata": {},
        }
        risky = {**base, "id": "doc:chunk-2", "ordinal": 2, "text": "完整参考答案：直接复制实现。", "answerRisk": "high"}
        result, report = filter_chunk_set({"chunks": [base, {**base, "id": "doc:chunk-1", "ordinal": 1}, risky]}, "ostep")
        self.assertEqual(len(result["chunks"]), 1)
        self.assertEqual(report["reasons"]["duplicate-chunk"], 1)
        self.assertEqual(report["reasons"]["answer-risk"], 1)

    def test_short_outline_labels_do_not_become_knowledge_chunks(self):
        chunks = {
            "chunks": [
                {"id": "c0", "ordinal": 0, "documentId": "doc", "text": "调度算法", "chunkType": "text", "answerRisk": "low", "metadata": {}},
                {"id": "c1", "ordinal": 1, "documentId": "doc", "text": "线程的设计实现", "chunkType": "text", "answerRisk": "low", "metadata": {}},
                {"id": "c2", "ordinal": 2, "documentId": "doc", "text": "调度器通过选择下一个可运行任务来决定 CPU 的分配顺序。", "chunkType": "text", "answerRisk": "low", "metadata": {}},
            ],
        }
        filtered, report = filter_chunk_set(chunks, "learningos-os-lectures-source")
        self.assertEqual([item["text"] for item in filtered["chunks"]], ["调度器通过选择下一个可运行任务来决定 CPU 的分配顺序。"])
        self.assertEqual(report["reasons"]["low-signal-short-chunk"], 2)

    def test_numbered_outline_sequences_do_not_become_knowledge_chunks(self):
        chunk_set = {
            "chunks": [{
                "id": "c0", "ordinal": 0, "documentId": "doc",
                "text": "2.1 读者-写者问题描述 2.2 读者-写者问题的信号量实现",
                "chunkType": "text", "answerRisk": "low", "metadata": {},
            }],
        }
        filtered, report = filter_chunk_set(chunk_set, "learningos-os-lectures-source")
        self.assertEqual(filtered["chunks"], [])
        self.assertEqual(report["reasons"]["outline-label-sequence"], 1)

    def test_adjacent_short_sections_merge_with_visible_section_labels(self):
        base = {
            "documentId": "doc", "sourceId": "learningos-os-lectures-source", "chunkType": "text",
            "blockOrdinals": [0], "locatorStart": {"lineStart": 1}, "locatorEnd": {"lineEnd": 1},
            "contentClass": "student-safe", "labScope": ["global"], "conceptIds": [],
            "answerRisk": "low", "indexable": True,
            "metadata": {"charCount": 30, "tokenEstimate": 8, "blockTypes": ["paragraph"], "sourcePath": "lec7/p2.md"},
        }
        chunks = {
            "chunking": {"targetChars": 1000, "maxChars": 1400},
            "chunks": [
                {**base, "id": "c0", "ordinal": 0, "text": "调度器通过就绪队列选择下一个可以运行的进程。", "sectionPath": ["进程调度", "就绪队列"]},
                {**base, "id": "c1", "ordinal": 1, "text": "时间片用于限制单个进程连续占用 CPU 的时长。", "sectionPath": ["进程调度", "时间片"]},
            ],
        }
        filtered, report = filter_chunk_set(chunks, "learningos-os-lectures-source")
        self.assertEqual(len(filtered["chunks"]), 1)
        self.assertEqual(filtered["chunks"][0]["sectionPath"], ["进程调度"])
        self.assertIn("就绪队列", filtered["chunks"][0]["text"])
        self.assertIn("时间片", filtered["chunks"][0]["text"])
        self.assertEqual(filtered["chunks"][0]["metadata"]["mergedShortChunks"], 1)
        self.assertEqual(report["mergedChunks"], 1)

    def test_damaged_pdf_code_and_character_mapping_are_rejected(self):
        document = {
            "sourceId": "ostep-zh-local-complete", "metadata": {"sourcePath": "05.pdf"},
            "blocks": [
                {"id": "b0", "ordinal": 0, "type": "paragraph", "text": "16 movl %ebp, 28(%eax)", "sectionPath": [], "locator": {}},
                {"id": "b1", "ordinal": 1, "type": "paragraph", "text": "子进程我会从 main 开始执行，我我无法假设父子进程的执行顺序。", "sectionPath": [], "locator": {}},
                {"id": "b2", "ordinal": 2, "type": "paragraph", "text": "操作系统通过保存和恢复寄存器完成上下文切换。", "sectionPath": ["上下文切换"], "locator": {}},
            ],
        }
        filtered, report = filter_document(document)
        self.assertEqual([item["text"] for item in filtered["blocks"]], ["操作系统通过保存和恢复寄存器完成上下文切换。"])
        self.assertEqual(report["reasons"]["misaligned-pdf-code"], 1)
        self.assertEqual(report["reasons"]["encoding-noise"], 1)

    def test_riscv_instruction_encoding_tables_are_rejected(self):
        document = {
            "sourceId": "riscv-reader-zh-local", "metadata": {"sourcePath": "riscv.pdf"},
            "blocks": [
                {"id": "b0", "ordinal": 0, "type": "paragraph", "text": "imm[31:12] rd 0110111 U lui imm[20|10:1|11|19:12] rd 1101111 J jal", "sectionPath": ["31 25 24 20 19 15 14 12 11 7 6"], "locator": {}},
                {"id": "b1", "ordinal": 1, "type": "paragraph", "text": "satp 保存根页表物理页号和地址翻译模式，切换地址空间时必须同步更新。", "sectionPath": ["10.4 虚拟存储器"], "locator": {}},
            ],
        }
        filtered, report = filter_document(document)
        self.assertEqual(len(filtered["blocks"]), 1)
        self.assertIn("satp", filtered["blocks"][0]["text"])
        self.assertEqual(report["reasons"]["instruction-encoding-table"], 1)

    def test_riscv_flattened_superscripts_and_register_tables_are_rejected(self):
        document = {
            "sourceId": "riscv-reader-zh-local", "metadata": {"sourcePath": "riscv.pdf"},
            "blocks": [
                {"id": "b0", "ordinal": 0, "type": "paragraph", "text": "Sv39 的树基数降到 29，并将地址空间划分为 29 个区域，支持 226 GiB 物理地址。", "sectionPath": ["10.4 分页"], "locator": {}},
                {"id": "b1", "ordinal": 1, "type": "paragraph", "text": "f1 / ft1 FP Temporary f2 / ft2 FP Temporary f3 / ft3 FP Temporary f4 / ft4 FP Temporary f5 / ft5 FP Temporary", "sectionPath": ["5.2 浮点寄存器"], "locator": {}},
                {"id": "b2", "ordinal": 2, "type": "paragraph", "text": "RISC-V 通过不同特权级隔离应用与内核，并由 CSR 保存陷入原因。", "sectionPath": ["特权级"], "locator": {}},
            ],
        }
        filtered, report = filter_document(document)
        self.assertEqual(len(filtered["blocks"]), 1)
        self.assertIn("特权级", filtered["blocks"][0]["text"])
        self.assertEqual(report["reasons"]["instruction-encoding-table"], 2)

    def test_riscv_front_matter_and_toc_section_contamination_are_removed(self):
        toc_section = "1.7 P 标准扩展 ................................... 9"
        document = {
            "sourceId": "riscv-reader-zh-local", "metadata": {"sourcePath": "riscv.pdf"},
            "blocks": [
                {
                    "id": "b0", "ordinal": 0, "type": "paragraph",
                    "text": "作者长期从事计算机体系结构研究，并参与了本书的翻译工作。",
                    "sectionPath": [toc_section], "locator": {"page": 14},
                },
                {
                    "id": "b1", "ordinal": 1, "type": "paragraph",
                    "text": "RISC-V 的目标是成为开放、稳定且适用于多种实现技术的通用指令集架构。",
                    "sectionPath": [toc_section, "第一章 为什么要有 RISC-V？"], "locator": {"page": 15},
                },
            ],
        }
        filtered, report = filter_document(document)
        self.assertEqual(len(filtered["blocks"]), 1)
        self.assertEqual(filtered["blocks"][0]["sectionPath"], ["第一章 为什么要有 RISC-V？"])
        self.assertEqual(report["reasons"]["front-matter"], 1)


if __name__ == "__main__":
    unittest.main()
