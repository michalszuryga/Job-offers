import json
import os
import re
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
import pandas as pd
import streamlit as st

from .config import load_config, save_user_overrides
from .scoring import score_job
from .models import Job
from .collector import collect_live_jobs, SOURCE_COUNT, SENSITIVE_SOURCE_COUNT
from .storage import DEFAULT_STATUSES, JobStore
from .sources.web_utils import infer_remote
from .cv_highlights import load_cv_highlights, match_highlights


st.set_page_config(page_title="Michal Job Finder", layout="wide", initial_sidebar_state="collapsed")

# Bridge Streamlit's own secret store into an env var, which is what
# JobStore() actually reads (keeps storage.py itself framework-agnostic, so
# it works unchanged from the CLI/tests too). No secrets.toml locally, or no
# DATABASE_URL key in it -> silently falls back to a local SQLite file.
try:
    if "DATABASE_URL" in st.secrets:
        os.environ["DATABASE_URL"] = st.secrets["DATABASE_URL"]
except Exception:
    pass


def filter_jobs(rows, cfg, min_score=0, status=None):
    """Rows come pre-sorted from the snapshot; this keeps that order."""
    remote_only = cfg.get("filters", {}).get("remote_only", False)
    return [
        r for r in rows
        if float(r.get("score") or 0) >= min_score
        and (not remote_only or r.get("remote") == 1)
        and (status is None or r.get("application_status") == status)
    ]


def get_stats(rows, cfg, new_ids):
    jobs = filter_jobs(rows, cfg)
    return {
        "jobs": jobs,
        "offers": len(jobs),
        "high_match": sum(
            float(j.get("score") or 0) >= cfg["filters"]["high_match_threshold"]
            for j in jobs
        ),
        "new": sum(j["external_id"] in new_ids for j in jobs),
    }


def new_ids_from(meta):
    try:
        return set(json.loads(meta.get("last_fetch_new_ids") or "[]"))
    except json.JSONDecodeError:
        return set()


def format_published_at(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return str(value)


def filter_by_published_window(jobs, window):
    hours = {"Last 24 hours": 24, "Last 3 days": 72, "Last 7 days": 168}.get(window)
    if hours is None:
        return jobs
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    recent = []
    for job in jobs:
        raw = job.get("published_at")
        if not raw:
            continue
        try:
            published = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            if published.astimezone(timezone.utc) >= cutoff:
                recent.append(job)
        except ValueError:
            continue
    return recent


def format_salary(job):
    low, high = job.get("salary_min"), job.get("salary_max")
    if low is None and high is None:
        return "Not listed"

    def amount(value):
        return f"{float(value):,.0f}".replace(",", " ")

    if low is None:
        value = amount(high)
    elif high is None or float(low) == float(high):
        value = amount(low)
    else:
        value = f"{amount(low)}–{amount(high)}"
    suffix = " ".join(part for part in (job.get("salary_currency"), job.get("salary_period")) if part)
    return f"{value} {suffix}".strip()


def parsed_score_breakdown(job):
    breakdown = job.get("score_breakdown") or {}
    if isinstance(breakdown, str):
        try:
            breakdown = json.loads(breakdown)
        except json.JSONDecodeError:
            breakdown = {}
    return breakdown if isinstance(breakdown, dict) else {}


def format_score_adjustments(job):
    breakdown = parsed_score_breakdown(job)
    labels = (
        ("automation title", "title_automation_penalty"),
        ("language in title", "title_programming_language_penalty"),
        ("stale offer", "stale_offer_penalty"),
        ("salary", "salary_bonus"),
    )
    parts = []
    for label, key in labels:
        value = breakdown.get(key, 0)
        if value:
            parts.append(f"{label} {value:+g}")
    return "; ".join(parts) if parts else "—"


_DESCRIPTION_BULLETS = "•✅✔️🔹➡️👉🎯📌⭐️🚀💡🔸▪️‣🧡🟣✍️🎁"
_DESCRIPTION_HEADINGS = (
    "requirements", "responsibilities", "benefits", "nice to have", "about the role",
    "wymagania", "obowiązki", "oferujemy", "zakres obowiązków", "mile widziane",
    "nasze wymagania", "benefity", "co oferujemy", "kogo szukamy", "twoja rola",
    "twoje zadania", "twoje umiejętności", "co zyskujesz", "o projekcie",
)


def format_description(text):
    """Descriptions are scraped as a single whitespace-collapsed block with no
    real line breaks. Reintroduce paragraph breaks before bullet markers and
    common section headings that survive as plain text, so it isn't one
    unbroken wall of text — best-effort, not a real layout reconstruction."""
    text = text or ""
    text = re.sub(rf"(?<=\S)(?=[{re.escape(_DESCRIPTION_BULLETS)}])", "\n\n", text)
    heading_pattern = "|".join(re.escape(h) for h in _DESCRIPTION_HEADINGS)
    text = re.sub(rf"(?<=[a-ząćęłńóśźż.!?:])\s+(?=(?:{heading_pattern})\b)", "\n\n", text, flags=re.I)
    return text.strip()


def refresh_scores_for_config(store, cfg, meta, visible_rows):
    """Reapply scoring rules to stored rows on a config change, and once a day
    to keep date-based points current. State lives in the DB, so a new browser
    session (phone visit, new tab) doesn't trigger a rescore on its own."""
    scoring_inputs = {key: cfg.get(key) for key in ("candidate", "scoring", "filters", "hard_exclusions")}
    signature = json.dumps(scoring_inputs, sort_keys=True, ensure_ascii=False)
    today = datetime.now(timezone.utc).date().isoformat()
    if st.session_state.get("scores_checked") == (signature, today):
        return False
    config_changed = meta.get("score_config_signature") != signature
    if not config_changed and meta.get("scores_refreshed_on") == today:
        st.session_state["scores_checked"] = (signature, today)
        return False

    # A config change can flip hard rejections, so it needs every row. A new
    # day only moves freshness and stale-offer points, which matter just for
    # offers that are visible — known offers skipped by a fetch are never
    # re-scored otherwise, so their freshness would stay frozen.
    rows = store.list_all() if config_changed else visible_rows
    rescored = []
    for row in rows:
        published_at = row.get("published_at")
        try:
            published_at = datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else None
        except ValueError:
            published_at = None
        remote = None if row.get("remote") is None else bool(row["remote"])
        inferred_remote = infer_remote(" ".join((row.get("title") or "", row.get("description") or "", row.get("location") or "")))
        if inferred_remote is not None:
            remote = inferred_remote
        job = Job(title=row.get("title") or "", company=row.get("company") or "", url=row.get("url") or "",
                  source=row.get("source") or "", description=row.get("description") or "",
                  location=row.get("location") or "", remote=remote, contract=row.get("contract") or "",
                  salary_min=row.get("salary_min"), salary_max=row.get("salary_max"),
                  salary_currency=row.get("salary_currency") or "", salary_period=row.get("salary_period") or "",
                  seniority=row.get("seniority") or "",
                  published_at=published_at)
        rescored.append(score_job(job, cfg))
    store.upsert_many(rescored, touch_last_seen=False)
    store.set_meta("score_config_signature", signature)
    store.set_meta("scores_refreshed_on", today)
    st.session_state["scores_checked"] = (signature, today)
    load_snapshot.clear()
    return True


def render_scoring_controls(cfg):
    scoring = cfg.setdefault("scoring", {})
    penalties = scoring.setdefault("penalties", {})
    salary_bonus_cfg = scoring.setdefault("salary_bonus", {})
    filters = cfg.setdefault("filters", {})

    with st.sidebar.expander("Scoring & filters", expanded=False):
        st.caption("Saved to a local override file. Streamlit Cloud may reset it after an app restart.")
        with st.form("scoring_filters_form"):
            remote_only = st.checkbox("Remote offers only", value=filters.get("remote_only", True))
            automation_penalty = st.slider(
                "Penalty: ‘automation’ in title", 0, 60,
                int(penalties.get("automation_title", 30)), step=5,
            )
            language_penalty = st.slider(
                "Penalty: C++ / Java / C# / Python in title", 0, 60,
                int(penalties.get("programming_language_title", 30)), step=5,
            )
            stale_after_days = st.number_input(
                "Treat offers older than (days)", 0, 90,
                int(penalties.get("stale_after_days", 10)), step=1,
            )
            stale_penalty = st.slider(
                "Penalty for stale offer", 0, 60,
                int(penalties.get("stale_offer", 15)), step=5,
            )
            salary_threshold = st.number_input(
                "Salary bonus threshold (PLN/month)", 0, 100000,
                int(salary_bonus_cfg.get("monthly_threshold_pln", 15000)), step=500,
            )
            salary_points = st.slider(
                "Salary bonus points", 0, 30,
                int(salary_bonus_cfg.get("points", 15)), step=5,
            )
            minimum_score = st.slider(
                "Minimum score to show", 0, 100,
                int(filters.get("minimum_score_to_show", 0)), step=5,
            )
            high_match_threshold = st.slider(
                "High match threshold", 0, 100,
                int(filters.get("high_match_threshold", 80)), step=5,
            )
            save_clicked = st.form_submit_button("Save criteria")

        if save_clicked:
            try:
                save_user_overrides({
                    "filters": {
                        "remote_only": remote_only,
                        "minimum_score_to_show": minimum_score,
                        "high_match_threshold": high_match_threshold,
                    },
                    "scoring": {"penalties": {
                        "automation_title": automation_penalty,
                        "programming_language_title": language_penalty,
                        "stale_after_days": stale_after_days,
                        "stale_offer": stale_penalty,
                    }, "salary_bonus": {
                        "monthly_threshold_pln": salary_threshold,
                        "points": salary_points,
                    }},
                })
                st.success("Criteria saved.")
                st.rerun()
            except OSError as exc:
                st.error(f"Could not save criteria: {exc}")

    return cfg


def render_fetch_diagnostics():
    results = st.session_state.get("last_fetch_results")
    if not results:
        return

    st.subheader("Live fetch diagnostics")

    rows = []
    notes = []
    reason_lines = []
    for result in results:
        candidates = result.get("candidates", result["count"])
        parsed = result.get("parsed", result["count"])
        if result["error_type"] == "OfferParseError":
            status = "⚠️ Some pages failed"
            notes.append(f'**{result["name"]}** — some detail pages failed: {result["error"]}')
        elif result["error"]:
            status = "❌ Failed"
            notes.append(f'**{result["name"]}** — [{result["error_type"]}] {result["error"]}')
        elif candidates == 0:
            status = "⚠️ 0 found"
            notes.append(
                f'**{result["name"]}** — 0 listing candidates found, no error raised. Usually means the '
                f"site blocked the request (anti-bot check) or changed its page structure."
            )
        else:
            status = "✅ OK"

        rows.append({
            "Source": result["name"],
            "Status": status,
            "Candidates": candidates,
            "Parsed": parsed,
            "Skipped (known)": result.get("skipped_known", 0),
            "Inserted": result["inserted"],
            "Updated": result["updated"],
            "Rejected": result["rejected"],
            "Duplicate": result.get("duplicate", 0),
            "Expired": result.get("expired", 0),
            "Seconds": result["seconds"],
        })

        reasons = result.get("rejected_by_reason") or {}
        if reasons:
            parts = ", ".join(f"{reason} ({count})" for reason, count in reasons.items())
            reason_lines.append(f'**{result["name"]}:** {parts}')

    st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)

    if notes:
        with st.expander("⚠️ Warnings & errors", expanded=True):
            for note in notes:
                st.markdown(f"- {note}")

    if reason_lines:
        with st.expander("Why offers were excluded"):
            for line in reason_lines:
                st.markdown(f"- {line}")


@st.cache_resource
def get_store(_class_id):
    # Streamlit reruns this whole script on every interaction (any click,
    # slider drag, etc). Without caching, JobStore() would reopen a fresh
    # Postgres connection and rerun its migration checks (including a
    # full-table UPDATE) on every single rerun, multiplying our exposure to
    # any network hiccup between Streamlit Cloud and the DB host. Caching
    # means that work happens once per container lifetime instead.
    return JobStore()


@st.cache_data(ttl=300, show_spinner=False)
def load_snapshot(_store):
    """Every widget interaction reruns the script; reading from the DB each
    time (4 round trips, full table) made every click slow on Cloud. One cached
    read instead, cleared after any write and refreshed at most every 5 min
    to pick up writes from another instance (e.g. local dev)."""
    return {"jobs": _store.list(0), "meta": _store.get_all_meta()}


def format_last_fetch(iso_value):
    if not iso_value:
        return "Last fetch: never"
    try:
        moment = datetime.fromisoformat(iso_value)
    except ValueError:
        return f"Last fetch: {iso_value}"
    try:
        from zoneinfo import ZoneInfo
        label = moment.astimezone(ZoneInfo("Europe/Warsaw")).strftime("%Y-%m-%d %H:%M")
    except Exception:
        label = moment.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    minutes = int((datetime.now(timezone.utc) - moment).total_seconds() // 60)
    if minutes < 60:
        age = f"{max(minutes, 0)} min ago"
    elif minutes < 60 * 48:
        age = f"{minutes // 60} h ago"
    else:
        age = f"{minutes // (60 * 24)} days ago"
    return f"Last fetch: {label} ({age})"


def main():
    st.title("Michal's Job Finder")
    st.caption("Hosted MVP - job matching, freshness scoring and application tracking.")

    cfg = load_config()
    cfg = render_scoring_controls(cfg)
    # Keyed on the class object so a hot code reload on Cloud (new JobStore
    # class) gets a fresh instance instead of a cached one missing new methods.
    store = get_store(id(JobStore))
    snapshot = load_snapshot(store)
    if refresh_scores_for_config(store, cfg, snapshot["meta"], snapshot["jobs"]):
        snapshot = load_snapshot(store)
    new_ids = new_ids_from(snapshot["meta"])

    stats = get_stats(snapshot["jobs"], cfg, new_ids)

    # Counters are always calculated from the current database state.
    col1, col2, col3 = st.columns(3)
    col1.metric("Eligible offers", stats["offers"])
    col2.metric("High match", stats["high_match"])
    col3.metric("New in last fetch", stats["new"])
    st.caption("Offer count includes remote jobs that passed hard exclusions; fetch diagnostics show listing candidates, parsed offers and exclusion reasons.")
    st.caption(format_last_fetch(snapshot["meta"].get("last_fetch_at")))

    skip_sensitive = st.checkbox(
        "Skip rate-limit-sensitive sources (Pracuj.pl, No Fluff Jobs, CzyJestEldorado)",
        value=False,
        help=(
            "These three have shown 429/403 blocks under heavy use. Check this for a "
            "faster run with the other 5 sources, or if one of them is currently blocking this IP."
        ),
    )

    c1, c2 = st.columns(2)

    with c1:
        fetch_clicked = st.button("Fetch live jobs", type="primary", use_container_width=True)

    with c2:
        if st.button("Reload", use_container_width=True):
            st.rerun()

    if fetch_clicked:
        progress_box = st.empty()
        progress_rows = []
        live_offer_rows = []
        total_sources = SOURCE_COUNT - (SENSITIVE_SOURCE_COUNT if skip_sensitive else 0)

        def _on_source_fetched(raw, result, new_jobs):
            status = "✅ done" if not raw["error"] else f'⚠️ {raw["error_type"]}'
            progress_rows.append({
                "Source": raw["source"].name,
                "Status": status,
                "Candidates": raw["candidates"],
                "Parsed": raw["parsed"],
                "Seconds": round(raw["seconds"], 1),
            })
            for job in new_jobs:
                job_dict = asdict(job)
                live_offer_rows.append({
                    "Score": job.score,
                    "Title": job.title,
                    "Company": job.company or "Brak w danych",
                    "Salary": format_salary(job_dict),
                    "Source": job.source,
                    "Offer link": job.url,
                })

            with progress_box.container():
                found_note = f" — {len(live_offer_rows)} new offer(s) found so far" if live_offer_rows else ""
                st.caption(f"{len(progress_rows)}/{total_sources} sources fetched so far{found_note}...")
                st.dataframe(pd.DataFrame(progress_rows), use_container_width=True, hide_index=True)
                if live_offer_rows:
                    ranked = sorted(live_offer_rows, key=lambda r: r["Score"], reverse=True)
                    st.dataframe(
                        pd.DataFrame(ranked),
                        use_container_width=True,
                        hide_index=True,
                        column_config={"Offer link": st.column_config.LinkColumn("Offer link", display_text="Open")},
                    )

        results = collect_live_jobs(on_source_fetched=_on_source_fetched, skip_sensitive=skip_sensitive, store=store)
        progress_box.empty()
        store.set_meta("last_fetch_at", datetime.now(timezone.utc).isoformat(timespec="seconds"))
        store.set_meta("last_fetch_new_ids", json.dumps(sorted({url for r in results for url in r.inserted_urls})))
        load_snapshot.clear()

        st.session_state["last_fetch_results"] = [
            {
                "name": r.name,
                "count": r.count,
                "inserted": r.inserted,
                "updated": r.updated,
                "rejected": r.rejected,
                "duplicate": r.duplicate,
                "expired": r.expired,
                "candidates": r.candidates,
                "parsed": r.parsed,
                "skipped_known": r.skipped_known,
                "rejected_by_reason": r.rejected_by_reason,
                "seconds": round(r.seconds, 2),
                "error": r.error,
                "error_type": r.error_type,
            }
            for r in results
        ]
        # Explicitly re-read the database after collection before rerunning.
        # This makes the next render use the newly inserted rows.
        st.success("Live offers fetched.")
        st.rerun()


    if not stats["jobs"]:
        st.info(
            "No live offers are currently stored. Click 'Fetch live jobs' to "
            "collect current offers from the configured sources."
        )
        if store.backend == "postgres":
            st.caption("Data is stored in a persistent Postgres database and survives app restarts.")
        else:
            st.caption(
                "Note: this instance is using a local SQLite file. Streamlit Cloud can "
                "restart the app and reset local SQLite data — configure DATABASE_URL "
                "in secrets to use a persistent database instead."
            )
        st.divider()
        render_fetch_diagnostics()
        return

    st.divider()

    min_score = st.slider(
        "Minimum match score",
        0,
        100,
        cfg["filters"]["minimum_score_to_show"],
    )
    st.caption("Offers below this final score are hidden. Hard-excluded offers never appear in the table.")
    published_window = st.selectbox(
        "Show offers published within",
        ["Any time", "Last 24 hours", "Last 3 days", "Last 7 days"],
    )
    status = st.selectbox("Application status", ["ALL"] + DEFAULT_STATUSES)
    limit = st.number_input(
        "Maximum offers",
        min_value=10,
        max_value=200,
        value=50,
        step=10,
    )

    # Fetch everything matching score/status/remote first, then apply the
    # published-window filter, and only then cap to "Maximum offers" — doing
    # it in this order (rather than capping in SQL first) means a tight
    # published-window filter can't hide offers that were pushed out by the
    # cap before it had a chance to see them.
    matching = filter_jobs(snapshot["jobs"], cfg, min_score, None if status == "ALL" else status)
    matching = filter_by_published_window(matching, published_window)
    jobs = matching[: int(limit)]
    if published_window != "Any time":
        st.caption("Offers without a reliable publication date are hidden for this time filter.")
    st.caption(
        f"Showing {len(jobs)} of {len(matching)} offers matching your filters "
        f"(score ≥ {min_score}). Lower 'Minimum match score' to see more."
    )

    if not jobs:
        st.info("No offers match the selected filters.")
        st.divider()
        render_fetch_diagnostics()
        return

    rows = []
    for i, j in enumerate(jobs, start=1):
        rows.append(
            {
                "No.": i,
                "Score": j["score"],
                "Title": ("🆕 " if j["external_id"] in new_ids else "") + j["title"],
                "Salary": format_salary(j),
                "Published": format_published_at(j.get("published_at")),
                "Company": j.get("company") or "Brak w danych",
                "Offer link": j["url"],
                "Source": j["source"],
                "Score adjustments": format_score_adjustments(j),
                "Freshness points (0-10)": j.get("recency_score", 0),
                "Location": j["location"],
                "Contract": j["contract"],
                "Status": j.get("application_status") or "TO_REVIEW",
            }
        )

    st.dataframe(
        pd.DataFrame(rows),
        use_container_width=True,
        hide_index=True,
        column_config={
            "No.": st.column_config.NumberColumn("No.", width="small"),
            "Score": st.column_config.NumberColumn("Score", width="small"),
            "Title": st.column_config.TextColumn("Title", width="large"),
            "Salary": st.column_config.TextColumn("Salary", width="medium"),
            "Published": st.column_config.TextColumn("Published", width="small"),
            "Company": st.column_config.TextColumn("Company", width="medium"),
            "Offer link": st.column_config.LinkColumn("Offer link", display_text="Open", width="small"),
            "Source": st.column_config.TextColumn("Source", width="small"),
            "Score adjustments": st.column_config.TextColumn(
                "Score adj.", width="medium", help="Score adjustments (penalties/bonuses applied)"
            ),
            "Freshness points (0-10)": st.column_config.NumberColumn(
                "Freshness", width="small", help="Freshness points (0-10)"
            ),
            "Location": st.column_config.TextColumn("Location", width="medium"),
            "Contract": st.column_config.TextColumn("Contract", width="small"),
            "Status": st.column_config.TextColumn("Status", width="small"),
        },
    )

    st.subheader("Job details")
    labels = [f'{j["score"]:.0f} - {j["title"]} - {j["company"]}' for j in jobs]
    selected = st.selectbox("Select a job", labels)
    job = jobs[labels.index(selected)]

    left, right = st.columns([2, 1])

    with left:
        st.markdown(f'### {job["title"]}')
        st.write(f'**{job.get("company") or "Brak w danych"}** · {job["location"]} · {job["contract"]}')
        st.write(f'**Salary:** {format_salary(job)}')
        with st.container(height=400, border=True):
            st.markdown(format_description(job["description"]))
        st.markdown(f'[Open original offer]({job["url"]})')

        cv_matches = match_highlights(parsed_score_breakdown(job), load_cv_highlights())
        if cv_matches:
            st.markdown("#### CV highlights for this offer")
            st.caption(
                "Rule-based, not AI — picked from your CV using the same technology/domain "
                "matches already used for scoring. No API call involved."
            )
            for match in cv_matches:
                st.markdown(f"- {match['text']}")
                st.caption("Matched: " + ", ".join(match["matched_tags"]))

    with right:
        st.metric("Match", job["score"])
        st.metric("Freshness bonus (0-10)", f'+{job.get("recency_score", 0)}')

        if job.get("score_breakdown"):
            st.markdown("#### Score breakdown")
            st.json(job["score_breakdown"])

        new_status = st.selectbox(
            "Status",
            DEFAULT_STATUSES,
            index=DEFAULT_STATUSES.index(job.get("application_status") or "TO_REVIEW"),
        )
        new_rate = st.text_input(
            "Rate you quoted them", value=job.get("applied_rate") or "",
            placeholder="e.g. 120 PLN/h B2B, 15000 PLN UoP",
        )
        new_notice = st.text_input(
            "Notice period you told them", value=job.get("notice_period") or "",
            placeholder="e.g. 1 month, immediate",
        )
        if job.get("applied_at"):
            st.caption(f'Applied: {format_published_at(job["applied_at"])}')

        if st.button("Save"):
            store.set_status(job["external_id"], new_status)
            store.save_application_details(job["external_id"], new_rate, new_notice)
            load_snapshot.clear()
            st.success("Saved.")
            st.rerun()

        if job.get("ai_analysis"):
            st.markdown("#### AI analysis")
            try:
                st.json(json.loads(job["ai_analysis"]))
            except json.JSONDecodeError:
                st.write(job["ai_analysis"])

    st.divider()
    render_fetch_diagnostics()


if __name__ == "__main__":
    main()
