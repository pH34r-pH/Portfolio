"""Regression coverage for links and landmarks in generated notebook readers."""
import tempfile
import copy
from compiled_experiment_reference import resolve_reference, render_handoff
from compiler_projection_input import load_pin, verified_projection
import unittest
import json
import sys
import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from bs4 import BeautifulSoup
from jsonschema import Draft202012Validator, ValidationError
from build_portfolio_bundle import (prepare_reader, publish_notebook, copy_lab_contents, apply_output_descriptions,
                                    _myst_asset_path, _prepare_article_execution, copy_thebe_assets,
                                    _source_file_index, _rewrite_myst_article_routes, main as build_bundle)
from digest_bundle import digest_tree
from finish_portfolio_lab import finish_lab
import nbformat


class ReaderPublicationTest(unittest.TestCase):
    def test_exact_compiler_reference_contract(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
        projection = fixture['projection']
        article = fixture['article']
        projection['experiments'][0]['backlinks'] = [article]
        reference = fixture['compiled_experiment']
        def resolve(data=projection, ref=reference):
            return resolve_reference(ref, data, article['url'], article['sourceCommit'])
        projection['experiments'][0]['backlinks'].append({'title':'Other canonical article',
            'url':'https://tyharbin.com/articles/other/', 'sourceCommit':'a'*40})
        invalid_extra = copy.deepcopy(projection)
        invalid_extra['experiments'][0]['backlinks'].append({'title':'Foreign source',
            'url':'https://example.org/other/', 'sourceCommit':'a'*40})
        with self.assertRaises(ValueError): resolve(invalid_extra)
        record = resolve()
        self.assertEqual(record['id'], reference['ref'])
        rendered = render_handoff(record)
        self.assertIn('Qualification is unknown', rendered)
        self.assertIn('does not establish execution', rendered)
        for invalid in ('latest', 'experiment-latest', '*', 'missing', '../experiment'):
            with self.subTest(ref=invalid), self.assertRaises(ValueError):
                resolve(ref={'ref': invalid})
        for field, value in (('schemaVersion', 3), ('schemaVersion', 2.0), ('project', {})):
            changed = copy.deepcopy(projection); changed[field] = value
            with self.assertRaises(ValueError): resolve(changed)
        duplicate = copy.deepcopy(projection)
        duplicate['experiments'].append(copy.deepcopy(duplicate['experiments'][0]))
        with self.assertRaises(ValueError): resolve(duplicate)
        for key, value in (('sha256', 'f'*64), ('profile', 'compiled-experiment-lifecycle-v1'),
                           ('source', {'repository':'other/repo', 'commit':'a'*40})):
            with self.subTest(assertion=key), self.assertRaises(ValueError):
                resolve(ref={**reference, 'expected':{key:value}})
        for field, value in (('detailUrl', 'javascript:alert(1)'), ('profile', 'unknown'),
                             ('package', {'sha256':'invalid'}),
                             ('package', {'sha256':'a'*64,'size':True}),
                             ('package', {'sha256':'a'*64,'size':0}), ('source', {'repository':'other/repo','commit':'main'}),
                             ('backlinks', []), ('backlinks', [{**article,'sourceCommit':'d'*40}]),
                             ('backlinks', [{**article,'url':'https://other.example/articles/other/'}]),
                             ('backlinks', [{**article,'url':'https://user:secret@tyharbin.com/articles/contract-fixture/'}])):
            changed = copy.deepcopy(projection); changed['experiments'][0][field] = value
            with self.subTest(field=field,value=value), self.assertRaises(ValueError): resolve(changed)

    def test_compiler_handoff_uses_existing_article_publication_path(self):
        with tempfile.TemporaryDirectory() as directory:
            args, schema, revisions, bundle, _ = self._article_bundle_fixture(Path(directory))
            source = Path(directory)/'research-notes/articles/sample-article.md'
            fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
            reference = fixture['compiled_experiment']
            source.write_text(source.read_text().replace('date: 2026-09-29',
                'date: 2026-09-29\ncompiled_experiment: ' + json.dumps(reference)))
            projection = fixture['projection']
            projection['experiments'][0].update({key:value for key,value in self._worklog_record().items()
                if key in ('question','method','protocol','executionAttempts','scientificInterpretation')})
            projection['experiments'][0]['backlinks'] = [{'title':'Sample article',
                'url':'https://tyharbin.com/articles/sample-article/', 'sourceCommit':revisions[1]}]
            path = Path(directory)/'compiler-projection.json'
            path.write_text(json.dumps(projection))
            with self.assertRaises(ValueError): self._build_fixture_bundle(args)
            pin = Path(directory)/'compiler-pin.json'
            pin.write_text(json.dumps({'schemaVersion':1,'repository':'pH34r-pH/experiment-compiler',
                'commit':'e'*40,'projectionSha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
            self._build_fixture_bundle(args + ['--compiler-projection',str(path),
                                              '--compiler-projection-pin',str(pin)])
            manifest = json.loads((bundle/'publication.json').read_text())
            Draft202012Validator(schema).validate(manifest)
            self.assertEqual(manifest['articles'][0]['compiled_experiment'],reference)
            page = BeautifulSoup((bundle/'articles/sample-article/index.html').read_text(),'html.parser')
            handoff = page.select_one('aside[aria-label="Compiled experiment reference"]')
            self.assertEqual(handoff.a['href'], 'https://experiments.tyharbin.com' + projection['experiments'][0]['detailUrl'])
            self.assertIn('Mixed/inconclusive',handoff.get_text())
            self.assertIn('evidence/result.json',handoff.get_text())
            self.assertIsNone(BeautifulSoup((bundle/'articles/sample-article-second/index.html').read_text(),'html.parser').select_one('aside[aria-label="Compiled experiment reference"]'))

    def _worklog_record(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
        record = fixture['projection']['experiments'][0]
        record.update({'question':'Does the fixture answer its declared question?',
                       'method':'Use synthetic data; retain failed comparisons.',
                       'protocol':{'record':'experiment/protocol.md',
                                   'text':'# Protocol\nUnits: loss per original byte.\nLimit: synthetic fixture.'},
                       'executionAttempts':[{'id':'#attempt-fixture',
                         'actionStatus':'https://schema.org/CompletedActionStatus',
                         'result':['evidence/result.json']}],
                       'scientificInterpretation':[{'record':'evidence/decision.md',
                         'summary':'Mixed/inconclusive; no overall winner.', 'aboutAttempt':'#attempt-fixture'}]})
        return record

    def test_worklog_preserves_source_text_and_evidence_boundaries(self):
        record = self._worklog_record()
        page = BeautifulSoup(render_handoff(record),'html.parser')
        self.assertEqual(page.select_one('pre[aria-label="Full authoritative experiment protocol"]').get_text(),
                         record['protocol']['text'])
        text = page.get_text(' ',strip=True)
        for value in (record['question'],record['method'],record['scientificInterpretation'][0]['summary'],
                      record['source']['commit'],record['package']['sha256'],'Completed',
                      'evidence/result.json','Scientific acceptance is not declared',
                      'does not independently verify its integrity','Independent reproduction is not established'):
            self.assertIn(value,text)
        self.assertEqual(page.select_one('a[download]')['href'],
                         'https://experiments.tyharbin.com/packages/' + record['package']['sha256'] + '.zip')
        self.assertTrue(page.select_one('details > summary'))
        self.assertEqual(page.pre['tabindex'],'0')
        self.assertNotIn('0%',text)

    def test_worklog_missing_plan_and_failed_attempts_do_not_become_success(self):
        fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
        record = fixture['projection']['experiments'][0]
        missing = BeautifulSoup(render_handoff(record),'html.parser').get_text(' ',strip=True)
        self.assertIn('Execution attempts are not declared',missing)
        record['executionAttempts'] = []
        plan = BeautifulSoup(render_handoff(record),'html.parser').get_text(' ',strip=True)
        self.assertIn('No execution attempts are recorded',plan)
        self.assertIsNone(BeautifulSoup(render_handoff(record),'html.parser').select_one('strong'))
        for status in ('Active','Failed','Completed'):
            record = self._worklog_record()
            record['executionAttempts'][0]['actionStatus'] = f'https://schema.org/{status}ActionStatus'
            record['result'] = {'acceptancePassed':False, 'metrics':{}}
            text = BeautifulSoup(render_handoff(record),'html.parser').get_text(' ',strip=True)
            self.assertIn(status,text)
            self.assertIn('scientific acceptance checks failed',text)
            self.assertIn('Mixed/inconclusive',text)
            self.assertNotIn('checks passed',text)

    def test_worklog_hostile_source_text_is_escaped(self):
        record = self._worklog_record()
        hostile = '<script>alert(1)</script><a href="javascript:bad">source</a>'
        record['question'] = record['method'] = hostile
        record['protocol']['text'] = hostile
        record['scientificInterpretation'][0]['summary'] = hostile
        page = BeautifulSoup(render_handoff(record),'html.parser')
        self.assertFalse(page.select('script, a[href^="javascript:"]'))
        self.assertEqual(page.pre.get_text(),hostile)
        self.assertIn(hostile,page.get_text())

    def test_worklog_rejects_malformed_records_and_nonfinite_values(self):
        cases = [('question',True), ('method',{}), ('package',{'sha256':'bad','size':1}),
                 ('source',{'repository':'javascript:bad','commit':'a'*40}), ('acceptance',[]), ('executionAttempts',{}),
                 ('executionAttempts',[{'id':'x','actionStatus':'unknown','result':[]}]),
                 ('executionAttempts',[{'id':'x','actionStatus':'https://schema.org/FailedActionStatus',
                                       'result':['../escape']}]),
                 ('protocol',{'record':'javascript:bad','text':'text'}),
                 ('protocol',{'record':'CON.txt','text':'text'}),
                 ('protocol',{'record':'protocol.md','text':False}), ('scientificInterpretation',{}),
                 ('scientificInterpretation',[{'record':'decision.md','summary':'claim','aboutAttempt':'missing'}]),
                 ('result',{'acceptancePassed':'true'}), ('result',[]),
                 ('result',{'metrics':{'loss':float('nan')}}), ('acceptance',{'bound':float('inf')})]
        for field, value in cases:
            record = self._worklog_record(); record[field] = value
            with self.subTest(field=field,value=value), self.assertRaises(ValueError): render_handoff(record)
        record = self._worklog_record()
        record['executionAttempts'].append(copy.deepcopy(record['executionAttempts'][0]))
        with self.assertRaises(ValueError): render_handoff(record)
        record = self._worklog_record()
        record['executionAttempts'][0]['result'] *= 2
        with self.assertRaises(ValueError): render_handoff(record)

    def test_pinned_compiler_input_checks_exact_bytes_and_pin(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
            projection = root/'experiments.json'
            projection.write_text(json.dumps(fixture['projection']))
            pin = {'schemaVersion':1, 'repository':'pH34r-pH/experiment-compiler',
                   'commit':'e'*40, 'projectionSha256':hashlib.sha256(projection.read_bytes()).hexdigest()}
            pin_path = root/'pin.json'
            pin_path.write_text(json.dumps(pin))
            data, receipt = verified_projection(projection, pin_path)
            self.assertEqual(data, fixture['projection'])
            self.assertEqual(receipt['commit'], pin['commit'])
            projection.write_text(projection.read_text() + '\n')
            with self.assertRaises(ValueError): verified_projection(projection, pin_path)
            for field, value in (('schemaVersion',1.0), ('commit','main'), ('commit','e'*39),
                                 ('projectionSha256','f'*63), ('repository','private/other'),
                                 ('unexpected',True)):
                pin_path.write_text(json.dumps({**pin,field:value}))
                with self.subTest(field=field), self.assertRaises(ValueError): load_pin(pin_path)
            pin_path.write_text(json.dumps(pin))
            link = root/'projection-link.json'; link.symlink_to(projection)
            with self.assertRaises(ValueError): verified_projection(link,pin_path)
            link = root/'pin-link.json'; link.symlink_to(pin_path)
            with self.assertRaises(ValueError): load_pin(link)

    def test_projection_receipt_preserves_unreferenced_articles(self):
        with tempfile.TemporaryDirectory() as directory:
            args, schema, _, bundle, _ = self._article_bundle_fixture(Path(directory))
            fixture = json.loads((Path(__file__).parent/'fixtures/article-reference-v1.json').read_text())
            path, pin = Path(directory)/'projection.json', Path(directory)/'pin.json'
            path.write_text(json.dumps(fixture['projection']))
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            pin.write_text(json.dumps({'schemaVersion':1,'repository':'pH34r-pH/experiment-compiler',
                'commit':'e'*40,'projectionSha256':digest}))
            self._build_fixture_bundle(args)
            original = [(bundle/article['url'].strip('/')/'index.html').read_bytes()
                        for article in json.loads((bundle/'publication.json').read_text())['articles']]
            with self.assertRaises(ValueError):
                self._build_fixture_bundle(args + ['--compiler-projection',str(path)])
            with self.assertRaises(ValueError):
                self._build_fixture_bundle(args + ['--compiler-projection-pin',str(pin)])
            self._build_fixture_bundle(args + ['--compiler-projection',str(path),'--compiler-projection-pin',str(pin)])
            manifest = json.loads((bundle/'publication.json').read_text())
            Draft202012Validator(schema).validate(manifest)
            self.assertEqual(manifest['compilerProjection']['sha256'],digest)
            self.assertEqual(set(manifest['sources']),{'portfolio','researchNotes','theoremLibrary'})
            self.assertEqual(original,[(bundle/article['url'].strip('/')/'index.html').read_bytes()
                                     for article in manifest['articles']])
            path.write_text(path.read_text() + '\n')
            with self.assertRaises(ValueError):
                self._build_fixture_bundle(args + ['--compiler-projection',str(path),'--compiler-projection-pin',str(pin)])

    def test_notebook_evidence_handoff_preserves_bytes_and_exact_identity(self):
        for kind in (None, "illustrative", "historical", "<script>unsafe</script>"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source = root / "research/notebooks/illustrative_name.ipynb"
                source.parent.mkdir(parents=True)
                notebook = nbformat.v4.new_notebook(cells=[
                    nbformat.v4.new_markdown_cell("# Source notebook")])
                if kind is not None:
                    notebook.metadata["publication"] = {"exampleKind": kind}
                nbformat.write(notebook, source)
                original = source.read_bytes()
                publication, readers = root / "publication", root / "readers"
                publication.mkdir()
                readers.mkdir()
                args = SimpleNamespace(research_notes=root / "research", research_notes_sha="a" * 40)
                entry = publish_notebook(source, publication, readers, "", {source}, args)
                page = BeautifulSoup((readers/source.stem/"index.html").read_text(), "html.parser")
                note = page.select_one('aside[aria-label="Notebook evidence and reproduction"]')
                self.assertIsNotNone(note)
                text = note.get_text(" ", strip=True)
                self.assertIn("not independent reproduction", text)
                self.assertIn("remains readable", text)
                self.assertIn("scientific checks", text)
                self.assertIn(entry["sha256"], text)
                self.assertEqual(publication.joinpath(source.name).read_bytes(), original)
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual(note.select_one("a")["href"],
                                 "https://github.com/pH34r-pH/research-notes/blob/" + "a" * 40 +
                                 "/notebooks/illustrative_name.ipynb")
                self.assertTrue(note.select_one("a[download]"))
                self.assertEqual(page.select_one('a[href^="/lab/lab/"]')['href'],
                                 '/lab/lab/?path=notebooks%2Fillustrative_name.ipynb')
                self.assertEqual("Illustrative browser example" in text, kind == "illustrative")
                if kind != "illustrative":
                    self.assertIn("execution status and scientific acceptance are not inferred", text)
                self.assertNotIn("<script>", str(note))
                self.assertIn("overflow-wrap:anywhere", str(note))

    def test_native_myst_article_routes_preserve_query_and_section(self):
        document = BeautifulSoup(
            '<a href="/endpoint-can-mislead?view=reading#interpretation">Next article</a>'
            '<a href="/accessible-does-not-imply-used/">Probe article</a>'
            '<a href="https://example.com/endpoint-can-mislead">External</a>', 'html.parser')
        _rewrite_myst_article_routes(document, [
            Path('006-endpoint-can-mislead.md'), Path('accessible-does-not-imply-used.md')])
        self.assertEqual([link['href'] for link in document.select('a')], [
            '/articles/006-endpoint-can-mislead/?view=reading#interpretation',
            '/articles/accessible-does-not-imply-used/',
            'https://example.com/endpoint-can-mislead'])

    def test_thebe_assets_copy_from_a_relative_exact_checkout(self):
        portfolio_root = Path(__file__).resolve().parents[1]
        helper = portfolio_root / "node_modules/thebe-core/bin/copy-thebe-assets.cjs"
        if not helper.is_file():
            self.skipTest("locked npm dependencies are not installed")
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "bundle"
            previous = os.getcwd()
            os.chdir(portfolio_root.parent)
            try:
                copy_thebe_assets(SimpleNamespace(
                    portfolio=Path(portfolio_root.name), output=output,
                ))
            finally:
                os.chdir(previous)
            for name in ("thebe-lite.min.js", "index.js", "thebe.css"):
                self.assertTrue((output / "assets/thebe" / name).is_file(), name)

    def test_source_file_index_resolves_relative_checkout_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'research-notes/articles/source.md'
            source.parent.mkdir(parents=True)
            source.write_text('unique source bytes')
            previous = os.getcwd()
            os.chdir(root)
            try:
                index = _source_file_index(Path('research-notes'))
            finally:
                os.chdir(previous)
            indexed = index[hashlib.sha256(source.read_bytes()).hexdigest()]
            self.assertEqual(indexed, source.resolve())
            self.assertEqual(indexed.relative_to((root / 'research-notes').resolve()), Path('articles/source.md'))

    def _article_bundle_fixture(self, root: Path):
        portfolio, research, theorem, bundle = (root/name for name in
                                                 ('Portfolio', 'research-notes', 'theorem-library', 'bundle'))
        for path in (portfolio/'site/research', portfolio/'site/data', research/'notebooks',
                     research/'reference', research/'articles', research/'_build/html', theorem):
            path.mkdir(parents=True)
        (portfolio/'site/index.html').write_text('<!doctype html><h1>Portfolio</h1>')
        for name in ('favicon.svg', 'favicon.ico'):
            (portfolio/'site'/name).write_bytes((Path(__file__).parent.parent/'site'/name).read_bytes())
        (portfolio/'site/research/index.html').write_text('<header class="topbar"><nav>Research</nav></header>')
        (portfolio/'site/data/atlas-evidence.json').write_text('{}')
        (portfolio/'jupyter-lite.json').write_text('{}')
        (research/'reference/glossary.md').write_text('# Glossary')
        nbformat.write(nbformat.v4.new_notebook(cells=[nbformat.v4.new_markdown_cell('# A reader')]),
                       research/'notebooks/001_reader.ipynb')
        article_source = ('---\ntitle: Sample article\ndescription: Reviewed test article.\n'
                          'date: 2026-09-29\n---\n(sample-article)=\n# Sample article\n\nA static article body.\n')
        second_source = ('---\ntitle: Second article\ndescription: Another reviewed test article.\n'
                         'date: 2026-09-29\n---\n(second-article)=\n# Second article\n\n'
                         'A different static article body.\n')
        (research/'articles/sample-article.md').write_text(article_source)
        (research/'articles/sample-article-second.md').write_text(second_source)
        disposition_source = '# Publication dispositions\n'
        (research/'PUBLICATION-DISPOSITIONS.md').write_text(disposition_source)
        figure_bytes = b'<svg xmlns="http://www.w3.org/2000/svg"><title>Fixture</title></svg>'
        (research/'articles/figure.svg').write_bytes(figure_bytes)
        myst_html = research/'_build/html/index.html'
        (myst_html.parent/'build').mkdir()
        (myst_html.parent/'build/figure-hash.svg').write_bytes(figure_bytes)
        notebook_bytes = (research/'notebooks/001_reader.ipynb').read_bytes()
        (myst_html.parent/'build/notebook-hash.ipynb').write_bytes(notebook_bytes)
        second_digest = hashlib.sha256(second_source.encode()).hexdigest()
        (myst_html.parent/'build'/f'article-second-{second_digest[:8]}.md').write_text(second_source)
        disposition_digest = hashlib.sha256(disposition_source.encode()).hexdigest()
        (myst_html.parent/'build'/f'dispositions-{disposition_digest[:8]}.md').write_text(disposition_source)
        myst_html.write_text('<!doctype html><html><main>Publication index</main></html>')
        first_page = myst_html.parent/'sample-article/index.html'
        first_page.parent.mkdir()
        first_page.write_text(
            '<!doctype html><html><main><article class="myst-article">'
            '<h2 id="sample-article">Sample article</h2><p>A static article body. '
            '<a href="/build/notebook-hash.ipynb">Source notebook</a> '
            '<a href="/build/article-second-' + second_digest[:8] + '.md">Second article</a> '
            '<a href="/build/dispositions-' + disposition_digest[:8] + '.md">Publication map</a></p>'
            '<div class="overflow-auto"><table><tr><th>Measure</th></tr><tr><td>Synthetic</td></tr></table></div>'
            '<figure><img src="/build/figure-hash.svg" alt="Fixture figure"></figure>'
            '</article></main></html>'
        )
        second_page = myst_html.parent/'sample-article-second/index.html'
        second_page.parent.mkdir()
        second_page.write_text('<!doctype html><html><main><article class="myst-article">'
                               '<h1 id="second-article">Second article</h1>'
                               '<p>A different static article body.</p></article></main></html>')
        (research/'myst.yml').write_text('version: 1\nproject:\n  toc:\n'
                                         '    - file: articles/sample-article.md\n'
                                         '    - file: articles/sample-article-second.md\n')
        revisions = ('a'*40, 'b'*40, 'c'*40)
        args = ['build_portfolio_bundle.py', '--portfolio', str(portfolio),
                '--research-notes', str(research), '--theorem-library', str(theorem),
                '--myst-html', str(myst_html), '--output', str(bundle),
                '--portfolio-sha', revisions[0], '--research-notes-sha', revisions[1],
                '--theorem-library-sha', revisions[2]]
        schema_path = Path(__file__).resolve().parent.parent/'publication.schema.json'
        schema = json.loads(schema_path.read_text())
        return args, schema, revisions, bundle, figure_bytes

    def _build_fixture_bundle(self, args):
        with patch.object(sys, 'argv', args):
            build_bundle()

    def test_public_candidate_v2_carries_articles_and_exact_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            args, schema, revisions, bundle, _ = self._article_bundle_fixture(Path(directory))
            self._build_fixture_bundle(args)
            manifest = json.loads((bundle/'publication.json').read_text())
            Draft202012Validator(schema).validate(manifest)
            self.assertEqual(manifest['schemaVersion'], 2)
            self.assertEqual({key: source['commit'] for key, source in manifest['sources'].items()},
                             dict(zip(('portfolio', 'researchNotes', 'theoremLibrary'), revisions)))
            self.assertEqual(len(manifest['notebooks']), 1)
            self.assertEqual(len(manifest['articles']), 2)
            self.assertEqual([article['sequence'] for article in manifest['articles']], [1, 2])
            self.assertEqual(manifest['articles'][0]['downloads'], {
                'pdf': '/article-exports/sample-article.pdf',
                'docx': '/article-exports/sample-article.docx',
                'latex': '/article-exports/sample-article-latex.zip',
                'jats': '/article-exports/sample-article.xml',
            })

    def test_brand_favicon_assets_and_generated_reader_links(self):
        site = Path(__file__).parent.parent/'site'
        for page in site.rglob('*.html'):
            with self.subTest(page=page):
                self.assertEqual(BeautifulSoup(page.read_text(), 'html.parser').select_one('link[rel="icon"]')['href'], '/favicon.svg')
        self.assertEqual((site/'favicon.ico').read_bytes()[:4], b'\x00\x00\x01\x00')
        with tempfile.TemporaryDirectory() as directory:
            args, _, _, bundle, _ = self._article_bundle_fixture(Path(directory))
            self._build_fixture_bundle(args)
            for name in ('favicon.svg', 'favicon.ico'):
                self.assertEqual((bundle/name).read_bytes(), (site/name).read_bytes())
            for route in ('articles/sample-article', 'notebooks/001_reader'):
                document = BeautifulSoup((bundle/route/'index.html').read_text(), 'html.parser')
                self.assertEqual(document.select_one('link[rel="icon"]')['href'], '/favicon.svg')

    def test_article_routes_preserve_accessible_tables_sources_and_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            args, _, revisions, bundle, figure_bytes = self._article_bundle_fixture(Path(directory))
            self._build_fixture_bundle(args)
            article_page = (bundle/'articles/sample-article/index.html').read_text()
            article_document = BeautifulSoup(article_page, 'html.parser')
            self.assertIn('<h1 id="sample-article">Sample article</h1>', article_page)
            self.assertIn('href="/notebooks/001_reader/"', article_page)
            self.assertIn('href="/articles/sample-article-second/"', article_page)
            self.assertIn('PUBLICATION-DISPOSITIONS.md', article_page)
            table_region = article_document.select_one('.overflow-auto[aria-label="Scrollable table: Measure"]')
            self.assertEqual(table_region.get('role'), 'region')
            self.assertEqual(table_region.get('tabindex'), '0')
            self.assertIn('src="/publication/article-assets/figure-hash.svg"', article_page)
            self.assertIn('research-notes/blob/' + revisions[1] + '/articles/sample-article.md', article_page)
            self.assertIn('href="/article-exports/sample-article.pdf"', article_page)
            self.assertIn('href="/article-exports/sample-article.docx"', article_page)
            self.assertIn('href="/article-exports/sample-article-latex.zip"', article_page)
            self.assertIn('href="/article-exports/sample-article.xml"', article_page)
            second_page = (bundle/'articles/sample-article-second/index.html').read_text()
            self.assertIn('<h1 id="second-article">Second article</h1>', second_page)
            self.assertNotIn('A static article body.', second_page)
            self.assertEqual((bundle/'publication/article-assets/figure-hash.svg').read_bytes(), figure_bytes)

    def test_candidate_digest_and_legacy_v1_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            args, schema, _, bundle, _ = self._article_bundle_fixture(Path(directory))
            self._build_fixture_bundle(args)
            manifest = json.loads((bundle/'publication.json').read_text())
            before = digest_tree(bundle)
            self.assertEqual(len(before), 64)
            (bundle/'site-change.txt').write_text('This changes the published bytes')
            self.assertNotEqual(digest_tree(bundle), before)
            with self.assertRaises(ValidationError):
                Draft202012Validator(schema).validate({**manifest, 'sources': {**manifest['sources'],
                    'fleet': {'repository': 'pH34r-pH/long-haul-fleet', 'commit': 'd'*40}}})
            self._build_fixture_bundle(args + ['--fleet-sha', 'd'*40])
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

    def test_article_execution_requires_an_explicit_browser_activation(self):
        document = BeautifulSoup(
            '<article><div class="myst-jp-nb-block" id="example">'
            '<pre><code>print(1)</code></pre>'
            '<div data-name="outputs-container"></div></div></article>',
            'html.parser',
        )
        self.assertTrue(_prepare_article_execution(document))
        self.assertEqual(len(document.select('[data-executable]')), 1)
        self.assertEqual(document.select_one('[data-executable]')["tabindex"], "0")
        self.assertTrue(document.select_one('[data-executable]')["aria-label"])
        self.assertEqual(len(document.select('[data-output][aria-live="polite"]')), 1)
        self.assertEqual(len(document.select('[data-load-browser-runtime]')), 1)

    def test_myst_assets_must_stay_inside_the_generated_build(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            myst_html = root/'_build/html/index.html'
            (root/'_build/html/build').mkdir(parents=True)
            (root/'_build/html/build/figure.svg').write_text('<svg/>')
            self.assertEqual(_myst_asset_path(myst_html, '/build/figure.svg'),
                             (root/'_build/html/build/figure.svg').resolve())
            with self.assertRaises(ValueError):
                _myst_asset_path(myst_html, '/build/../../../outside.svg')
            (root/'outside.svg').write_text('<svg/>')
            (root/'_build/html/build/linked.svg').symlink_to(root/'outside.svg')
            with self.assertRaises(ValueError):
                _myst_asset_path(myst_html, '/build/linked.svg')

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
