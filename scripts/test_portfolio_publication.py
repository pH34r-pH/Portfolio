"""Regression coverage for links and landmarks in generated notebook readers."""
import tempfile
import unittest
import json
import sys
from pathlib import Path
from unittest.mock import patch
from bs4 import BeautifulSoup
from jsonschema import Draft202012Validator, ValidationError
from build_portfolio_bundle import prepare_reader, copy_lab_contents, apply_output_descriptions, main as build_bundle
from digest_bundle import digest_tree
from finish_portfolio_lab import finish_lab
import nbformat


class ReaderPublicationTest(unittest.TestCase):
    def test_public_candidate_v2_has_exact_public_sources_and_v1_remains_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            portfolio, research, theorem, bundle = (root/name for name in
                                                   ('Portfolio', 'research-notes', 'theorem-library', 'bundle'))
            for directory_name in (portfolio/'site/research', portfolio/'site/data',
                                   research/'notebooks', research/'reference', theorem):
                directory_name.mkdir(parents=True)
            (portfolio/'site/index.html').write_text('<!doctype html><h1>Portfolio</h1>')
            (portfolio/'site/research/index.html').write_text('<header class="topbar"><nav>Research</nav></header>')
            (portfolio/'site/data/atlas-evidence.json').write_text('{}')
            (portfolio/'jupyter-lite.json').write_text('{}')
            (research/'reference/glossary.md').write_text('# Glossary')
            nbformat.write(nbformat.v4.new_notebook(cells=[nbformat.v4.new_markdown_cell('# A reader')]),
                           research/'notebooks/001_reader.ipynb')
            revisions = ('a'*40, 'b'*40, 'c'*40)
            args = ['build_portfolio_bundle.py', '--portfolio', str(portfolio),
                    '--research-notes', str(research), '--theorem-library', str(theorem),
                    '--output', str(bundle), '--portfolio-sha', revisions[0],
                    '--research-notes-sha', revisions[1], '--theorem-library-sha', revisions[2]]
            schema = json.loads((Path(__file__).resolve().parent.parent/'publication.schema.json').read_text())
            with patch.object(sys, 'argv', args):
                build_bundle()
            manifest = json.loads((bundle/'publication.json').read_text())
            Draft202012Validator(schema).validate(manifest)
            self.assertEqual(manifest['schemaVersion'], 2)
            self.assertEqual({key: source['commit'] for key, source in manifest['sources'].items()},
                             dict(zip(('portfolio', 'researchNotes', 'theoremLibrary'), revisions)))
            self.assertEqual(len(manifest['notebooks']), 1)
            before = digest_tree(bundle)
            self.assertEqual(len(before), 64)
            (bundle/'site-change.txt').write_text('This changes the published bytes')
            self.assertNotEqual(digest_tree(bundle), before)
            with self.assertRaises(ValidationError):
                Draft202012Validator(schema).validate({**manifest, 'sources': {**manifest['sources'],
                    'fleet': {'repository': 'pH34r-pH/long-haul-fleet', 'commit': 'd'*40}}})
            with patch.object(sys, 'argv', args + ['--fleet-sha', 'd'*40]):
                build_bundle()
            legacy = json.loads((bundle/'publication.json').read_text())
            Draft202012Validator(schema).validate(legacy)
            self.assertEqual(legacy['schemaVersion'], 1)
            self.assertEqual(legacy['sources']['fleet']['commit'], 'd'*40)
            with self.assertRaises(ValidationError):
                Draft202012Validator(schema).validate({**legacy, 'sources': manifest['sources']})

    def test_lab_preserves_source_paths_bytes_and_return_navigation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            research, bundle, portfolio = root/'research', root/'bundle', root/'portfolio'
            (research/'notebooks').mkdir(parents=True)
            (research/'reference').mkdir()
            (research/'notebooks/example.ipynb').write_text('original notebook bytes')
            (research/'reference/glossary.md').write_text('# Affine map')
            copy_lab_contents(research, bundle)
            for path in ['notebooks/example.ipynb', 'example.ipynb']:
                self.assertEqual((bundle/'publication/lab-contents'/path).read_text(), 'original notebook bytes')
            self.assertEqual((bundle/'publication/lab-contents/reference/glossary.md').read_text(), '# Affine map')
            (portfolio/'publication').mkdir(parents=True)
            (portfolio/'publication/lab-return.html').write_text('<nav id="portfolio-lab-return"><a href="/research/">Return</a></nav>')
            (bundle/'assets').mkdir()
            (bundle/'assets/lab-return.css').write_text('#main{top:44px}')
            (bundle/'lab/lab').mkdir(parents=True)
            entry = bundle/'lab/lab/index.html'
            entry.write_text('<html><head></head><body class="lab"><script>window.original=true</script></body></html>')
            finish_lab(portfolio, bundle)
            finish_lab(portfolio, bundle)
            doc = BeautifulSoup(entry.read_text(), 'html.parser')
            self.assertEqual(len(doc.select('#portfolio-lab-return')), 1)
            self.assertEqual(doc.select_one('a')['href'], '/research/')
            self.assertEqual(doc.select_one('script').string, 'window.original=true')
            self.assertEqual((bundle/'lab/reference/glossary.md').read_text(), '# Affine map')

    def test_plot_description_comes_from_notebook_source(self):
        notebook = nbformat.v4.new_notebook(cells=[nbformat.v4.new_code_cell(outputs=[
            nbformat.v4.new_output('display_data', data={'image/png':'YWJj'},
                                  metadata={'publication': {'alt': 'Synthetic curve, not benchmark evidence.'}})])])
        doc = BeautifulSoup(apply_output_descriptions(notebook, '<img src="data:image/png;base64,YWJj">'), 'html.parser')
        self.assertEqual(doc.img['alt'], 'Synthetic curve, not benchmark evidence.')
        with self.assertRaises(ValueError):
            apply_output_descriptions(notebook, '<p>No image</p>')

    def test_relative_references_and_notebook_links_keep_their_meaning(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            notebooks = root / "notebooks"
            notebooks.mkdir()
            source = notebooks / "atlas.ipynb"
            other = notebooks / "001_example.ipynb"
            other.write_text("unchanged notebook bytes")
            reference = root / "reference/glossary.md"
            reference.parent.mkdir()
            reference.write_text("# Affine map")
            rendered = '''<main><h1>Actual notebook title<a class="anchor-link">¶</a></h1>
            <p><a href="001_example.ipynb#Result">Related notebook</a>
            <a href="../reference/glossary.md#affine-map">Reference</a>
            <a href="https://example.org/proof">External</a><a href="#local">Local</a></p>
            <h2 id="local">Local section</h2><div class="highlight"><pre>print(1)</pre></div>
            <div class="jp-OutputArea-output"><table><tr><td>1</td></tr></table></div></main>'''
            title, output = prepare_reader(rendered, source, {other.resolve()}, root, "a" * 40)
            document = BeautifulSoup(output, "html.parser")
            links = [link["href"] for link in document.find_all("a")]
            self.assertEqual(title, "Actual notebook title")
            self.assertEqual(links, [
                "/notebooks/001_example/#Result",
                "https://github.com/pH34r-pH/research-notes/blob/" + "a" * 40 + "/reference/glossary.md#affine-map",
                "https://example.org/proof", "#local",
            ])
            self.assertFalse(document.select("main, h1, .anchor-link"))
            self.assertEqual(document.select_one("h2")["id"], "local")
            for block in document.select(".highlight, .jp-OutputArea-output"):
                self.assertEqual(block["tabindex"], "0")
                self.assertEqual(block["role"], "region")
                self.assertTrue(block["aria-label"])
            self.assertEqual(other.read_text(), "unchanged notebook bytes")

    def test_non_published_paths_are_not_invented_as_reader_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "notebooks/example.ipynb"
            title, output = prepare_reader(
                '<p><a href="missing.ipynb">Missing</a><a href="/atlas/">Atlas</a>'
                '<a href="mailto:example@example.org">Email</a></p>',
                source, set(), root, "b" * 40,
            )
            self.assertEqual(title, "example")
            self.assertEqual([a["href"] for a in BeautifulSoup(output, "html.parser").find_all("a")],
                             ["missing.ipynb", "/atlas/", "mailto:example@example.org"])


if __name__ == "__main__":
    unittest.main()
