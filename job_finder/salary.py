"""Salary normalization helpers for scoring job offers."""


def monthly_salary_pln(job, salary_cfg):
    """Normalize the minimum stated salary to PLN/month when period and FX are known."""
    low = job.salary_min if job.salary_min is not None else job.salary_max
    if low is None:
        return None
    currency = (job.salary_currency or "").upper()
    exchange_rates = salary_cfg.get("exchange_rates", {})
    rate = 1.0 if currency in {"", "PLN", "ZŁ"} else exchange_rates.get(currency)
    if rate is None:
        return None

    period = (job.salary_period or "").lower()
    if period in {"hour", "hourly", "h"}:
        monthly = float(low) * float(salary_cfg.get("hours_per_month", 160))
    elif period in {"day", "daily", "md"}:
        monthly = float(low) * float(salary_cfg.get("workdays_per_month", 20))
    elif period in {"year", "yearly", "annual"}:
        monthly = float(low) / 12
    elif period in {"month", "monthly", "mo"}:
        monthly = float(low)
    else:
        return None
    return monthly * float(rate)
