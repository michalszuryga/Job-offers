from datetime import date

import pytest

from job_finder.storage import JobStore
from job_finder.models import Job
from job_finder.tailor_cv import (CHANGES_MARKER, TailorError, build_prompt, check_integrity, find_offer,
                                  mark_cv_generated, split_reply, tailor)

BASE = """<!doctype html><html><head><title>CV</title></head><body>
<header><h1>Jan Tester</h1><p class="eyebrow">Software QA Engineer · 8+ years</p>
<div class="contact"><span>Koszalin</span></div><img class="photo" src="img/me.jpg"></header>
<section><p class="label">Profile</p><p class="profile">QA engineer, 8+ years, healthcare and fintech.</p></section>
<section><p class="label">Experience</p>
<div class="job"><div class="job-head"><h3>Acme</h3><span class="dates">2024 – Present</span></div>
<p class="role"><strong>QA Engineer</strong> · remote</p><ul><li>API testing with Postman.</li><li>SQL checks.</li></ul>
<div class="stack"><span class="k">Stack</span><span>Postman</span><span>SQL</span></div></div>
<div class="job"><div class="job-head"><h3>Beta</h3><span class="dates">2019 – 2024</span></div>
<p class="role"><strong>SQA Engineer</strong></p><ul><li>Cypress tests.</li></ul>
<div class="stack"><span class="k">Stack</span><span>Cypress</span></div></div></section>
<section><p class="label">Skills</p><dl class="grid"><dt>Automation</dt><dd>Cypress, Playwright</dd></dl></section>
<section><p class="label">Education</p><div class="edu"><h3>Uni</h3><p>BSc</p></div></section>
<section><p class="label">Certificates</p><ul><li>ISTQB CTFL</li></ul></section>
<section><p class="label">Languages</p><dl class="grid"><dt>English</dt><dd>C1</dd></dl></section>
</body></html>"""

OFFER = {"external_id": "https://seidor.example/1", "url": "https://seidor.example/1",
         "title": "Test Engineer senior | EU Institutions", "company": "SEIDOR", "location": "Remote",
         "description": "Manual testing, SQL, ISTQB, banking.", "application_status": "TO_REVIEW"}


def _tailored(**swap):
    html = BASE.replace("QA engineer, 8+ years, healthcare and fintech.", "QA engineer, 8+ years, SQL and API testing.")
    html = html.replace("<li>API testing with Postman.</li><li>SQL checks.</li>", "<li>SQL checks.</li><li>API testing with Postman.</li>")
    for old, new in swap.items():
        html = html.replace(old, new)
    return html


def test_reordering_and_rewording_passes():
    assert check_integrity(BASE, _tailored()) == []


@pytest.mark.parametrize("old,new,problem", [
    ("<h3>Beta</h3>", "<h3>Beta Corp</h3>", "employers/schools changed"),
    ("2019 – 2024", "2018 – 2024", "dates changed"),
    ("<strong>SQA Engineer</strong>", "<strong>Senior QA Engineer</strong>", "roles changed"),
    ("<li>ISTQB CTFL</li>", "<li>ISTQB CTFL</li><li>ISTQB Advanced</li>", "Certificates section changed"),
    ("<dd>C1</dd>", "<dd>C2</dd>", "Languages section changed"),
    ("<dd>Cypress, Playwright</dd>", "<dd>Cypress, Playwright, Selenium</dd>", "skills not in the base CV"),
    ("<span>Cypress</span></div></div></section>", "<span>Cypress</span><span>Postman</span></div></div></section>",
     "Beta: stack gained"),
    ("· 8+ years</p>", "· 10+ years</p>", "years of experience changed"),
])
def test_invented_facts_are_caught(old, new, problem):
    problems = check_integrity(BASE, _tailored(**{"_": ""}).replace(old, new))
    assert any(p.startswith(problem) for p in problems), problems


def test_split_reply_handles_fences_and_notes():
    html, notes = split_reply(f"Here you go:\n```html\n{BASE}\n```\n{CHANGES_MARKER}\n## Zmiany\n- profil")
    assert html.startswith("<!doctype html>") and html.endswith("</html>")
    assert notes == "## Zmiany\n- profil"
    with pytest.raises(TailorError):
        split_reply("Sorry, I can't.")


def test_prompt_carries_offer_and_cv():
    prompt = build_prompt(OFFER, BASE)
    assert "Test Engineer senior | EU Institutions" in prompt and "banking" in prompt and "<h3>Acme</h3>" in prompt


def test_tailor_writes_html_notes_and_pdf(tmp_path):
    (tmp_path / "cv.html").write_text(BASE, encoding="utf-8")
    reply = f"{_tailored()}\n{CHANGES_MARKER}\n## Zmiany\n- SQL first\n## Braki względem oferty\n- banking"
    pdfs = []
    result = tailor(OFFER, base_dir=tmp_path, runner=lambda prompt, model=None: reply,
                    pdf=lambda html, pdf: pdfs.append(pdf) or pdf, today=date(2026, 11, 4))
    assert result.html_path == tmp_path / "tailored" / "2026-11-04-seidor-test-engineer-senior-eu-institutions.html"
    assert '<base href="../">' in result.html_path.read_text()
    assert "banking" in result.notes_path.read_text()
    assert result.pdf_path == pdfs[0]


def test_tailor_refuses_a_cv_with_invented_facts(tmp_path):
    (tmp_path / "cv.html").write_text(BASE, encoding="utf-8")
    bad = _tailored().replace("<h3>Beta</h3>", "<h3>Google</h3>")
    with pytest.raises(TailorError, match="employers/schools changed"):
        tailor(OFFER, base_dir=tmp_path, runner=lambda prompt, model=None: bad, pdf=lambda h, p: None)
    assert list((tmp_path / "tailored").glob("*.rejected.html"))
    assert not list((tmp_path / "tailored").glob("*[!d].html"))


def test_status_moves_to_cv_generated_only_from_early_statuses(tmp_path):
    store = JobStore(str(tmp_path / "jobs.db"))
    store.upsert(Job(title="Tester", company="SEIDOR", url="https://seidor.example/1", source="TalentClue"))
    offer = find_offer(store, "https://seidor.example/1/")
    assert offer and offer["title"] == "Tester"
    assert mark_cv_generated(store, offer, "/cv/x.pdf")
    stored = store.get(offer["external_id"])
    assert stored["application_status"] == "CV_GENERATED" and stored["tailored_cv_path"] == "/cv/x.pdf"
    assert not mark_cv_generated(store, {**stored, "application_status": "APPLIED"}, "/cv/y.pdf")
