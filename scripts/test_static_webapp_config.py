"""Fast regression coverage for the Azure Static Web Apps ARCC route contract."""
import json
import unittest
from pathlib import Path


class StaticWebAppConfigTest(unittest.TestCase):
    def test_card_recipe_is_inline_and_has_extensionless_compatibility_route(self):
        root = Path(__file__).parents[1]
        config = json.loads((root / "site/staticwebapp.config.json").read_text())
        self.assertEqual(config["mimeTypes"][".md"], "text/plain; charset=utf-8")

        routes = {route["route"]: route for route in config["routes"]}
        self.assertEqual(routes["/card"]["rewrite"], "/card.md")
        self.assertEqual(routes["/card"]["headers"]["Content-Disposition"], "inline")
        self.assertEqual(routes["/card.md"]["headers"]["Content-Disposition"], "inline")
        self.assertTrue((root / "site/card.md").read_text().startswith("# ARCC profile recipe"))


    def test_agent_discovery_files_explicitly_allow_supported_retrieval(self):
        root = Path(__file__).parents[1]
        robots = (root / "site/robots.txt").read_text()
        for agent in ("OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot"):
            self.assertIn(f"User-agent: {agent}\nAllow: /", robots)
        self.assertIn("User-agent: *\nAllow: /", robots)

        llms = (root / "site/llms.txt").read_text()
        self.assertTrue(llms.startswith("# Tyler J.H.G."))
        self.assertIn("https://tyharbin.com/card.md", llms)
        self.assertIn("https://tyharbin.com/card", llms)


if __name__ == "__main__":
    unittest.main()
