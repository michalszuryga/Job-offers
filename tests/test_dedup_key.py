from job_finder.models import dedup_key


def test_dedup_key_ignores_legal_suffix_and_country():
    assert dedup_key("QA Engineer", "Acme Polska Sp. z o.o.") == dedup_key("QA Engineer", "Acme")


def test_dedup_key_ignores_gender_marker_in_title():
    assert dedup_key("Senior QA Engineer (k/m)", "Acme") == dedup_key("Senior QA Engineer", "Acme")


def test_dedup_key_distinguishes_different_roles_or_companies():
    assert dedup_key("QA Engineer", "Acme") != dedup_key("QA Automation Lead", "Acme")
    assert dedup_key("QA Engineer", "Acme") != dedup_key("QA Engineer", "Other Co")
