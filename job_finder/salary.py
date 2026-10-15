"""Salary normalization helpers for scoring job offers."""

APPROXIMATE_PLN_RATES = {"EUR": 4.40, "USD": 4.00, "GBP": 5.20, "CHF": 4.70}

PERIOD_ALIASES = {
    "hour": "hour", "hourly": "hour", "h": "hour",
    "day": "day", "daily": "day", "md": "day",
    "month": "month", "monthly": "month", "mo": "month",
    "year": "year", "yearly": "year", "annual": "year",
}

# Plausibility guard for salary periods, in PLN-equivalent (other currencies are
# scaled by APPROXIMATE_PLN_RATES, so EUR 1000/h is judged like PLN 4400/h).
# Boards' own unit is sometimes wrong (an employer types a B2B hourly rate into a
# monthly field: JustJoin.IT "85–90 PLN/month"), and text extraction can miss or
# misread the unit. Only an amount outside its period's range is touched; any
# value inside these deliberately wide ranges is left exactly as the board said.
PLAUSIBLE_PLN = {
    "hour": (15, 1000),
    "day": (100, 5000),
    "month": (1000, 150000),
    "year": (15000, 3000000),
}

# When the period is missing or implausible, guess it from the amount alone
# (upper bound inclusive, PLN-equivalent): ≤500 an hourly rate, ≤2500 a daily
# rate, ≤80 000 a monthly salary, above that a yearly one. Below 15 nothing fits.
MIN_SALARY_PLN = 15
INFERENCE_BANDS_PLN = ((500, "hour"), (2500, "day"), (80000, "month"))


def _pln_rate(currency):
    currency = (currency or "").upper()
    return 1.0 if currency in {"", "PLN", "ZŁ"} else APPROXIMATE_PLN_RATES.get(currency)


def canonical_period(period):
    return PERIOD_ALIASES.get((period or "").strip().lower(), "")


def infer_period(amount_pln):
    """The period an amount most plausibly belongs to, from its size alone."""
    if amount_pln < MIN_SALARY_PLN:
        return ""
    for upper, period in INFERENCE_BANDS_PLN:
        if amount_pln <= upper:
            return period
    return "year"


def normalize_salary(salary_min, salary_max, currency, period):
    """Return (min, max, currency, period) with an impossible period corrected.

    - A period whose amount (the low end, as used for the estimate) falls
      outside PLAUSIBLE_PLN is re-inferred from the magnitude.
    - An empty period is inferred from the magnitude the same way.
    - A non-PLN "monthly" amount below the floor is dropped rather than
      reinterpreted: TestDevJobs leaked a "Similar jobs" gig's €100–200/month
      into other offers, and reading it as €100/h would invent a top salary.
    - Unknown currencies (no FX rate) and amounts no band fits are left alone,
      apart from an implausible period being cleared.
    """
    low = salary_min if salary_min is not None else salary_max
    canonical = canonical_period(period)
    rate = _pln_rate(currency)
    if low is None or rate is None:
        return salary_min, salary_max, currency, canonical or (period or "")
    amount = float(low) * rate
    if canonical:
        lower, upper = PLAUSIBLE_PLN[canonical]
        if lower <= amount <= upper:
            return salary_min, salary_max, currency, canonical
        if canonical == "month" and amount < lower and rate != 1.0:
            return None, None, "", ""
    return salary_min, salary_max, currency, infer_period(amount)


def normalize_job_salary(job):
    """Apply normalize_salary to a Job in place (idempotent) and return it."""
    job.salary_min, job.salary_max, job.salary_currency, job.salary_period = normalize_salary(
        job.salary_min, job.salary_max, job.salary_currency, job.salary_period)
    return job


def monthly_salary_pln(job, salary_cfg):
    """Normalize the minimum stated salary to PLN/month when period and FX are known."""
    salary_min, salary_max, currency, period = normalize_salary(
        job.salary_min, job.salary_max, job.salary_currency, job.salary_period)
    low = salary_min if salary_min is not None else salary_max
    if low is None:
        return None
    rate = _pln_rate(currency)
    if rate is None:
        return None

    if period == "hour":
        monthly = float(low) * float(salary_cfg.get("hours_per_month", 160))
    elif period == "day":
        monthly = float(low) * float(salary_cfg.get("workdays_per_month", 20))
    elif period == "year":
        monthly = float(low) / 12
    elif period == "month":
        monthly = float(low)
    else:
        return None
    return monthly * float(rate)
