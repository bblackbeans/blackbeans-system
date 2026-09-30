from __future__ import annotations

import json
import unittest

from fastmcp.exceptions import ToolError

from blackbeans_mcp.client import BlackBeansApiError
from blackbeans_mcp.client import comment_payload
from blackbeans_mcp.client import nest_subtasks
from blackbeans_mcp.client import parse_entity_id
from blackbeans_mcp.server import _err


class McpHelperTests(unittest.TestCase):
    def test_comment_payload_uses_content(self):
        self.assertEqual(comment_payload("oi"), {"content": "oi"})

    def test_parse_task_and_project_urls(self):
        task_id = "70d546ab-1111-4111-8111-111111111111"
        project_id = "e95a2137-2222-4222-8222-222222222222"
        self.assertEqual(
            parse_entity_id(f"https://sistema.blackbeans.com.br/#task/{task_id}", expected="task"),
            task_id,
        )
        self.assertEqual(
            parse_entity_id(f"https://sistema.blackbeans.com.br/#project/{project_id}", expected="project"),
            project_id,
        )
        self.assertEqual(parse_entity_id(task_id, expected="task"), task_id)
        with self.assertRaises(BlackBeansApiError):
            parse_entity_id(f"#project/{project_id}", expected="task")

    def test_nest_subtasks(self):
        parent = {"id": "p", "title": "Mae", "parent_id": None}
        child = {"id": "c", "title": "Filha", "parent_id": "p"}
        nested = nest_subtasks([parent, child])
        self.assertEqual(len(nested), 1)
        self.assertEqual(nested[0]["subtasks"][0]["id"], "c")

    def test_auth_failure_raises_tool_error(self):
        with self.assertRaises(ToolError) as caught:
            _err(BlackBeansApiError("Autenticacao necessaria.", status_code=401))
        payload = json.loads(str(caught.exception))
        self.assertEqual(payload["status_code"], 401)
        self.assertIn("Autenticacao", payload["error"])


if __name__ == "__main__":
    unittest.main()
