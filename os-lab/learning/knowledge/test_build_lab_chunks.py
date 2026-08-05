import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_lab_chunks import build_lab_manuals


class BuildLabChunksTest(unittest.TestCase):
    def test_builds_all_eight_lab_manuals_with_scoped_chunks(self):
        workspace_root = Path(__file__).resolve().parents[3]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "lab-manuals"
            manifest = build_lab_manuals(workspace_root, output)
            self.assertEqual(manifest["labCount"], 8)
            self.assertEqual([item["labId"] for item in manifest["labs"]], [f"lab{number}" for number in range(1, 9)])
            self.assertTrue(all(item["blockCount"] > 0 and item["chunkCount"] > 0 for item in manifest["labs"]))
            self.assertTrue(all(item["labScopes"] == [item["labId"]] for item in manifest["labs"]))
            self.assertTrue((output / "manifest.json").is_file())
            self.assertTrue(all((output / item["chunkFile"]).is_file() for item in manifest["labs"]))
            lab1_document = (output / "documents" / "lab1.document.json").read_text(encoding="utf-8")
            lab1_chunks = (output / "chunks" / "lab1.chunks.json").read_text(encoding="utf-8")
            self.assertIn('"sourcePath": "os-lab/labs/lab1-bare-metal.md"', lab1_document)
            self.assertIn('"path": "os-lab/labs/lab1-bare-metal.md"', lab1_chunks)
            self.assertNotIn(str(workspace_root).replace("\\", "/"), lab1_chunks)


if __name__ == "__main__":
    unittest.main()
