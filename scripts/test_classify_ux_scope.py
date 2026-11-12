import unittest
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from classify_ux_scope import classify_paths, documentation_path, text_only_change


class ScopeTests(unittest.TestCase):
    def test_only_search_runtime_change_gets_search_scope(self):
        with patch('classify_ux_scope.git', return_value=b'present'):
            self.assertEqual(classify_paths(['site/assets/search.js'], 'base', 'head'), 'search')
            self.assertIsNone(classify_paths(['site/assets/search.js', 'site/assets/site.css'], 'base', 'head'))

    def test_only_repository_documentation_is_scoped_as_documentation(self):
        self.assertTrue(documentation_path('README.md'))
        self.assertTrue(documentation_path('docs/design/example.md'))
        self.assertFalse(documentation_path('site/card.md'))
        self.assertFalse(documentation_path('docs/example.html'))
        self.assertFalse(documentation_path('.github/workflows/example.yml'))

    def test_only_prose_on_declared_static_pages_is_scoped(self):
        page = '<!doctype html><h1>Old</h1><a href="/research/">Read</a><script>boot()</script>'
        self.assertTrue(text_only_change('site/about/index.html', page, page.replace('Old', 'New')))
        self.assertFalse(text_only_change('site/about/index.html', page, page.replace('/research/', '/other/')))
        self.assertFalse(text_only_change('site/about/index.html', page, page.replace('boot()', 'other()')))
        self.assertFalse(text_only_change('site/about/index.html', page, page.replace('<h1>', '<h2>').replace('</h1>', '</h2>')))
        self.assertFalse(text_only_change('site/index.html', page, page.replace('Old', 'New')))
        self.assertFalse(text_only_change('site/about/index.html', page, page + '<!-- changed -->'))

    def test_template_and_style_text_are_not_prose(self):
        for tag in ('script', 'style', 'template', 'textarea'):
            self.assertFalse(text_only_change('site/resume/index.html', f'<{tag}>old</{tag}>', f'<{tag}>new</{tag}>'))

    def test_git_scope_fails_closed_for_unsupported_and_missing_inputs(self):
        classifier = Path(__file__).with_name('classify_ux_scope.py').resolve()
        with tempfile.TemporaryDirectory() as tmp:
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=tmp, stderr=subprocess.DEVNULL).decode().strip()
            def classify(base, head):
                return subprocess.run([sys.executable, str(classifier), '--event', 'pull_request', base, head], cwd=tmp, capture_output=True).returncode
            git('init', '-q')
            git('config', 'user.email', 'scope-test@example.invalid')
            git('config', 'user.name', 'Scope Test')
            page = Path(tmp) / 'site/about/index.html'
            page.parent.mkdir(parents=True)
            page.write_text('<h1>Before</h1>', encoding='utf-8')
            readme = Path(tmp) / 'README.md'
            readme.write_text('before', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'base')
            base = git('rev-parse', 'HEAD')
            page.write_text('<h1>After</h1>', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'text')
            text_head = git('rev-parse', 'HEAD')
            self.assertEqual(classify(base, text_head), 0)
            for event in ('push', 'workflow_dispatch'):
                result = subprocess.run([sys.executable, str(classifier), '--event', event, base, text_head], cwd=tmp, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
            self.assertNotEqual(classify(text_head, text_head), 0)
            self.assertNotEqual(classify('bad-revision', text_head), 0)
            page.unlink()
            git('add', '-A')
            git('commit', '-qm', 'delete')
            self.assertNotEqual(classify(base, git('rev-parse', 'HEAD')), 0)
            git('checkout', base, '--', 'site/about/index.html')
            readme.write_text('after', encoding='utf-8')
            git('add', '-A')
            git('commit', '-qm', 'documentation')
            result = subprocess.run([sys.executable, str(classifier), '--event', 'pull_request', base, git('rev-parse', 'HEAD')], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.stdout.strip(), 'documentation')

    def test_only_existing_article_audit_scripts_get_the_focused_scope(self):
        classifier = Path(__file__).with_name('classify_ux_scope.py').resolve()
        with tempfile.TemporaryDirectory() as tmp:
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=tmp, stderr=subprocess.DEVNULL).decode().strip()
            git('init', '-q')
            git('config', 'user.email', 'scope-test@example.invalid')
            git('config', 'user.name', 'Scope Test')
            script = Path(tmp) / 'scripts/article-lm-browser-audit.mjs'
            script.parent.mkdir(parents=True)
            script.write_text('before', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'base')
            base = git('rev-parse', 'HEAD')
            script.write_text('after', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'audit')
            head = git('rev-parse', 'HEAD')
            result = subprocess.run([sys.executable, str(classifier), '--event', 'pull_request', base, head], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout.strip(), 'article-audit')
            script.unlink()
            git('add', '-A')
            git('commit', '-qm', 'delete')
            result = subprocess.run([sys.executable, str(classifier), '--event', 'pull_request', base, git('rev-parse', 'HEAD')], cwd=tmp, capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
