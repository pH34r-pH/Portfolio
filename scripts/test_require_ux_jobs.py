import unittest

from require_ux_jobs import evaluate

FULL = {'checks': 'true', 'media': 'true', 'lighthouse': 'true', 'bundle': 'true', 'pages': 'false', 'audits': '[{"name":"ux"}]'}
OK = {'scope': {'result': 'success'}, 'checks': {'result': 'success'}, 'record': {'result': 'success'}, 'lighthouse': {'result': 'success'},
      'build': {'result': 'success'}, 'audit': {'result': 'success'}, 'pages-copy': {'result': 'skipped'}}


def failures(needs, selection=FULL):
    return evaluate(needs, selection)[1]


class GateTests(unittest.TestCase):
    def test_all_expected_jobs_succeeding_passes(self):
        self.assertEqual(failures(OK), [])

    def test_any_failure_or_cancellation_fails(self):
        for result in ('failure', 'cancelled'):
            self.assertTrue(failures({**OK, 'audit': {'result': result}}))

    def test_expected_job_that_was_skipped_fails(self):
        # An upstream failure also shows downstream jobs as skipped.
        self.assertTrue(failures({**OK, 'audit': {'result': 'skipped'}}))
        self.assertTrue(failures({**OK, 'build': {'result': 'skipped'}}))

    def test_unexpected_skips_are_fine_on_the_fast_path(self):
        fast = {'checks': 'false', 'media': 'false', 'lighthouse': 'false', 'bundle': 'false', 'pages': 'false', 'audits': '[]'}
        needs = {job: {'result': 'skipped'} for job in OK}
        needs['scope'] = {'result': 'success'}
        self.assertEqual(failures(needs, fast), [])

    def test_failed_classification_fails(self):
        self.assertTrue(failures({**OK, 'scope': {'result': 'failure'}}))


if __name__ == '__main__':
    unittest.main()
