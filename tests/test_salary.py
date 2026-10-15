import pytest

from job_finder.config import load_config
from job_finder.models import Job
from job_finder.salary import infer_period, monthly_salary_pln, normalize_salary
from job_finder.scoring import score_job
from job_finder.sources.web_utils import extract_salary


@pytest.mark.parametrize("low, high, currency, period, expected_period", [
    # Real production rows: B2B hourly or daily rates filed as "month".
    (85, 90, "PLN", "month", "hour"),        # JellyLabs Senior QA Engineer on JustJoin.IT
    (70, 120, "PLN", "month", "hour"),
    (115, 115, "PLN", "month", "hour"),      # No Fluff Jobs
    (550, 650, "PLN", "month", "day"),
    (700, 900, "PLN", "month", "day"),
    # Monthly amounts filed under a smaller period.
    (12000, 16000, "PLN", "hour", "month"),
    (8000, 10000, "PLN", "day", "month"),
    (1200, 1500, "PLN", "hour", "day"),
    (80, 90, "PLN", "day", "hour"),
    # A yearly figure filed as monthly, and the other way round.
    (180000, 220000, "PLN", "month", "year"),
    (12000, 14000, "PLN", "year", "month"),
    # Scaled by FX: EUR 300/h is 1 320 PLN/h, implausible; EUR 4 000/day too.
    (300, 350, "EUR", "hour", "day"),
    (4000, 5000, "EUR", "day", "month"),
])
def test_impossible_periods_are_corrected_by_magnitude(low, high, currency, period, expected_period):
    assert normalize_salary(low, high, currency, period) == (low, high, currency, expected_period)


@pytest.mark.parametrize("low, high, currency, period", [
    (100, 140, "PLN", "hour"), (40, 50, "EUR", "hour"), (180, 220, "PLN", "hour"),
    (900, 1100, "PLN", "day"), (1300, 1520, "PLN", "day"), (500, 700, "EUR", "day"),
    (14000, 18000, "PLN", "month"), (1500, 2000, "PLN", "month"), (3300, 4100, "EUR", "month"),
    (96000, 120000, "USD", "year"), (42000, 48000, "EUR", "year"), (120000, 150000, "PLN", "year"),
])
def test_plausible_values_are_never_changed(low, high, currency, period):
    assert normalize_salary(low, high, currency, period) == (low, high, currency, period)


@pytest.mark.parametrize("low, currency, expected", [
    (110, "PLN", "hour"), (80, "USD", "hour"), (650, "PLN", "day"), (2000, "PLN", "day"),
    (9600, "PLN", "month"), (27000, "PLN", "month"), (89250, "EUR", "year"), (150000, "PLN", "year"),
    (5, "PLN", ""),
])
def test_an_empty_period_is_inferred_from_the_magnitude(low, currency, expected):
    assert normalize_salary(low, None, currency, "")[3] == expected


def test_aliases_are_canonicalized_and_maximum_is_used_without_a_minimum():
    assert normalize_salary(120, 140, "PLN", "Hourly") == (120, 140, "PLN", "hour")
    assert normalize_salary(None, 90, "PLN", "month") == (None, 90, "PLN", "hour")


def test_a_tiny_foreign_monthly_amount_is_dropped_not_reinterpreted():
    # TestDevJobs leaked a "Similar jobs" gig's €100–200/month into other
    # offers; reading it as €100/h would invent a 70k PLN/month salary.
    assert normalize_salary(100, 200, "EUR", "month") == (None, None, "", "")


def test_unknown_currency_and_missing_amounts_are_left_alone():
    assert normalize_salary(45000, 55000, "SEK", "month") == (45000, 55000, "SEK", "month")
    assert normalize_salary(80, 90, "SEK", "month") == (80, 90, "SEK", "month")
    assert normalize_salary(None, None, "", "") == (None, None, "", "")


def test_normalization_is_idempotent():
    for args in [(85, 90, "PLN", "month"), (16000, 16000, "PLN", "hour"), (89250, 89250, "EUR", ""),
                 (5_000_000, None, "PLN", "year")]:
        once = normalize_salary(*args)
        assert normalize_salary(*once) == once


def test_infer_period_band_edges():
    assert [infer_period(x) for x in (14.9, 15, 500, 500.1, 2500, 2501, 80000, 80001)] == [
        "", "hour", "hour", "day", "day", "month", "month", "year"]


def test_job_construction_normalizes_and_the_estimate_and_bonus_follow():
    cfg = load_config()
    salary_cfg = cfg["scoring"]["salary_bonus"]

    def job(low, high):
        return Job("QA Engineer", "JellyLabs", "https://justjoin.it/job-offer/x", "JustJoin.IT",
                   description="Remote QA Engineer, Playwright", remote=True,
                   salary_min=low, salary_max=high, salary_currency="PLN", salary_period="month")

    jellylabs = job(85, 90)
    assert jellylabs.salary_period == "hour"
    assert monthly_salary_pln(jellylabs, salary_cfg) == 85 * 160
    below = score_job(jellylabs, cfg).score_breakdown
    assert (below["salary_assessment"]["estimated_monthly_pln"], below["salary_bonus"]) == (13600, 0)
    # 110 PLN "/month" used to be estimated at 110 PLN; as 110 PLN/h it clears the threshold.
    above = score_job(job(110, 140), cfg).score_breakdown
    assert (above["salary_assessment"]["estimated_monthly_pln"], above["salary_bonus"]) == (17600, salary_cfg["points"])


def test_score_job_normalizes_fields_assigned_after_construction():
    job = Job("QA Engineer", "Acme", "https://board.test/1", "src", remote=True)
    job.salary_min, job.salary_max, job.salary_currency, job.salary_period = 16000, 16000, "PLN", "hour"
    score_job(job, load_config())
    assert job.salary_period == "month"
    assert job.score_breakdown["salary_assessment"]["estimated_monthly_pln"] == 16000


@pytest.mark.parametrize("text, expected", [
    # No Fluff Jobs listing cards.
    ("130 – 145 PLN / godz.", (130, 145, "PLN", "hour")),
    ("650 – 715 PLN / dzień", (650, 715, "PLN", "day")),
    ("130 – 145 PLN + VAT (B2B) godzinowo", (130, 145, "PLN", "hour")),
    # Bulldogjob detail header.
    ("14 000 - 16 000 PLN Brutto ( UoP ) / mies.", (14000, 16000, "PLN", "month")),
    # TestDevJobs header lines.
    ("💵 $60 - $110 / hour", (60, 110, "USD", "hour")),
    ("💵 €100 - €200 / month", (100, 200, "EUR", "month")),
    ("💵 €42,000 - €48,000", (42000, 48000, "EUR", "")),
    # CzyJestEldorado descriptions.
    ("100 - 130 PLN netto per hour (+ VAT).", (100, 130, "PLN", "hour")),
    ("8 000 - 10 000 zł brutto miesięcznie na UoP", (8000, 10000, "PLN", "month")),
    ("Monthly gross salary of 17,500 PLN – 22,000 PLN.", (17500, 17500, "PLN", "month")),
    ("Stawka godzinowa: 120 - 140 PLN netto + VAT", (120, 140, "PLN", "hour")),
])
def test_text_salary_reads_the_unit_next_to_the_amount(text, expected):
    assert extract_salary(text) == expected


def test_an_unrelated_later_word_is_not_taken_as_the_unit():
    # The old 24-character window read "8 godzin dziennie" as an hourly rate.
    assert extract_salary("Wynagrodzenie 16 000 PLN, 8 godzin dziennie") == (16000, 16000, "PLN", "")
    # "Wynagrodzenie" (salary) used to be disqualified as a "nagroda" (award).
    assert extract_salary("Wynagrodzenie: 120-140 PLN/h netto") == (120, 140, "PLN", "hour")
