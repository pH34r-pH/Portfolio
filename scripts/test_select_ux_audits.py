import json
import unittest

from select_ux_audits import AUDITS, render, select


def names(selection):
    return [audit['name'] for audit in selection['audits']]


class SelectionTests(unittest.TestCase):
    def test_full_push_runs_every_audit_once(self):
        selection = select('push', False, 'full')
        self.assertEqual(sorted(names(selection)), sorted(AUDITS))
        self.assertTrue(all(selection[key] for key in ('checks', 'media', 'lighthouse', 'bundle')))
        self.assertFalse(selection['pages'])

    def test_fast_path_push_still_builds_and_audits_the_candidate(self):
        selection = select('push', True, 'full')
        self.assertTrue(selection['bundle'] and selection['media'])
        self.assertFalse(selection['checks'] or selection['lighthouse'])
        self.assertEqual(sorted(names(selection)), sorted(AUDITS))

    def test_fast_path_pull_request_runs_nothing_heavy(self):
        for scope in ('full', 'documentation'):
            selection = select('pull_request', True, scope)
            self.assertEqual(names(selection), [])
            self.assertFalse(any(selection[key] for key in ('checks', 'media', 'lighthouse', 'bundle', 'pages')))

    def test_text_only_scopes_skip_model_audits(self):
        for scope in ('page-text', 'search'):
            selection = select('pull_request', False, scope)
            self.assertEqual(names(selection), ['ux', 'interaction', '2071', 'appearance'])
            self.assertTrue(selection['lighthouse'] and selection['pages'])

    def test_article_audit_scope_only_runs_the_article_audit(self):
        selection = select('pull_request', False, 'article-audit')
        self.assertEqual(names(selection), ['article-model-sticky'])
        self.assertFalse(selection['lighthouse'] or selection['pages'])

    def test_manual_runs_build_pages_and_audit_everything(self):
        selection = select('workflow_dispatch', False, 'full')
        self.assertTrue(selection['pages'])
        self.assertEqual(sorted(names(selection)), sorted(AUDITS))

    def test_output_is_machine_readable(self):
        lines = dict(line.split('=', 1) for line in render(select('push', False, 'full')))
        self.assertEqual(lines['bundle'], 'true')
        self.assertEqual(len(json.loads(lines['audits'])), len(AUDITS))


if __name__ == '__main__':
    unittest.main()
