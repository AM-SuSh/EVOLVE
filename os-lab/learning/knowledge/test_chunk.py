import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from chunk import chunk_document


class ChunkTest(unittest.TestCase):
    def setUp(self):
        self.document = {
            "schemaVersion": 1,
            "documentId": "test:doc",
            "sourceId": "platform-lab-packages",
            "title": "Lab 2",
            "format": "markdown",
            "language": "mixed",
            "contentHash": "a" * 64,
            "metadata": {"sourcePath": "os-lab/lab-packages/lab2/checkpoints.yaml"},
            "blocks": [
                {"id": "b0", "ordinal": 0, "type": "heading", "text": "入口", "sectionPath": ["Lab 2", "入口"], "locator": {"lineStart": 1}},
                {"id": "b1", "ordinal": 1, "type": "paragraph", "text": "先描述你观察到的现象。", "sectionPath": ["Lab 2", "入口"], "locator": {"lineStart": 3}},
                {"id": "b2", "ordinal": 2, "type": "paragraph", "text": "再提出一个可以验证的假设。", "sectionPath": ["Lab 2", "入口"], "locator": {"lineStart": 5}},
                {"id": "b3", "ordinal": 3, "type": "heading", "text": "运行", "sectionPath": ["Lab 2", "运行"], "locator": {"lineStart": 8}},
                {"id": "b4", "ordinal": 4, "type": "code", "language": "rust", "text": "fn main() {}", "sectionPath": ["Lab 2", "运行"], "locator": {"lineStart": 10}},
            ],
        }
        self.policy = {"sourceBindings": [{"sourceId": "platform-lab-packages", "defaultClass": "guided-hint"}], "hardDenyPaths": []}

    def test_chunks_do_not_cross_sections_and_keep_locators(self):
        result = chunk_document(self.document, policy=self.policy, target_chars=1000, max_chars=1400)
        self.assertEqual(len(result["chunks"]), 2)
        self.assertEqual(result["chunks"][0]["sectionPath"], ["Lab 2", "入口"])
        self.assertEqual(result["chunks"][0]["blockOrdinals"], [1, 2])
        self.assertEqual(result["chunks"][1]["blockOrdinals"], [4])
        self.assertEqual(result["chunks"][1]["locatorStart"]["lineStart"], 10)
        self.assertEqual(result["chunks"][1]["chunkType"], "code")

    def test_policy_metadata_marks_guided_hint_and_lab_scope(self):
        chunk = chunk_document(self.document, policy=self.policy)["chunks"][0]
        self.assertEqual(chunk["contentClass"], "guided-hint")
        self.assertEqual(chunk["labScope"], ["lab2"])
        self.assertEqual(chunk["answerRisk"], "medium")
        self.assertTrue(chunk["indexable"])

    def test_manual_filename_derives_lab_scope(self):
        self.document["sourceId"] = "platform-lab-manuals"
        self.document["metadata"]["sourcePath"] = "os-lab/labs/lab2-trap-and-task.md"
        self.policy["sourceBindings"] = [{"sourceId": "platform-lab-manuals", "defaultClass": "student-safe"}]
        chunk = chunk_document(self.document, policy=self.policy)["chunks"][0]
        self.assertEqual(chunk["labScope"], ["lab2"])

    def test_hard_deny_is_not_indexable(self):
        self.document["metadata"]["sourcePath"] = "os-lab/lab-packages/lab2/variants/answer.md"
        self.policy["hardDenyPaths"] = ["os-lab/lab-packages/**/variants/**"]
        chunk = chunk_document(self.document, policy=self.policy)["chunks"][0]
        self.assertEqual(chunk["answerRisk"], "blocked")
        self.assertFalse(chunk["indexable"])

    def test_concept_override_and_id_are_preserved(self):
        self.document["metadata"]["sourcePath"] = "os-lab/lab-packages/lab2/concepts/trap.yaml"
        self.document["blocks"] = [{
            "id": "b0",
            "ordinal": 0,
            "type": "structured",
            "text": "id: os.trap.entry\nsignals:\n- stvec",
            "sectionPath": ["trap"],
            "locator": {"path": "trap.yaml"},
        }]
        self.policy["sourceBindings"][0]["pathOverrides"] = [{
            "pattern": "lab[2-8]/concepts/*.yaml",
            "contentClass": "student-safe",
        }]
        chunk = chunk_document(self.document, policy=self.policy)["chunks"][0]
        self.assertEqual(chunk["contentClass"], "student-safe")
        self.assertEqual(chunk["conceptIds"], ["os.trap.entry"])
        self.assertEqual(chunk["chunkType"], "structured")

    def test_long_code_keeps_complete_fences(self):
        self.document["blocks"] = [{
            "id": "b0",
            "ordinal": 0,
            "type": "code",
            "language": "rust",
            "text": "x" * 100,
            "sectionPath": ["Lab 2", "运行"],
            "locator": {"lineStart": 1},
        }]
        chunks = chunk_document(self.document, policy=self.policy, target_chars=20, max_chars=40)["chunks"]
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(item["text"].startswith("```rust\n") and item["text"].endswith("\n```") for item in chunks))
        self.assertTrue(all(item["metadata"]["charCount"] <= 40 for item in chunks))


if __name__ == "__main__":
    unittest.main()
