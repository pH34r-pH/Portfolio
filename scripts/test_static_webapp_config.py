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

    def test_security_headers_and_branded_404_override(self):
        root = Path(__file__).parents[1]
        config = json.loads((root / "site/staticwebapp.config.json").read_text())
        self.assertEqual(config["mimeTypes"][".html"], "text/html; charset=utf-8")
        self.assertEqual(config["mimeTypes"][".xml"], "application/xml; charset=utf-8")
        self.assertEqual(
            config["responseOverrides"]["404"],
            {"rewrite": "/404.html", "statusCode": 404},
        )
        headers = config["globalHeaders"]
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["X-Frame-Options"], "SAMEORIGIN")
        self.assertEqual(headers["Referrer-Policy"], "same-origin")
        self.assertIn("camera=()", headers["Permissions-Policy"])
        self.assertIn("'wasm-unsafe-eval'", headers["Content-Security-Policy"])
        self.assertIn("worker-src 'self' blob:", headers["Content-Security-Policy"])
        not_found = (root / "site/404.html").read_text(encoding="utf-8")
        self.assertIn('name="robots" content="noindex"', not_found)
        self.assertNotIn("data-pagefind-body", not_found)

    def test_agent_discovery_files_explicitly_allow_supported_retrieval(self):
        root = Path(__file__).parents[1]
        robots = (root / "site/robots.txt").read_text()
        for agent in ("OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot"):
            self.assertIn(f"User-agent: {agent}\nAllow: /", robots)
        self.assertIn("User-agent: *\nAllow: /", robots)
        self.assertIn("Sitemap: https://tyharbin.com/sitemap.xml", robots)

        llms = (root / "site/llms.txt").read_text()
        self.assertTrue(llms.startswith("# Tyler J.H.G."))
        self.assertIn("https://tyharbin.com/card.md", llms)
        self.assertIn("https://tyharbin.com/card", llms)


if __name__ == "__main__":
    unittest.main()
