import argparse

from .collector import run_fetch
from .config import load_config, overrides_from_meta
from .notify import build_summary, fetch_is_current, send_email, summary_rows
from .schedule import daily_fetch_done
from .scoring import score_job
from .storage import JobStore
from .sources.sample import SampleSource


def _local_database_url():
    """Local runs use the same database as the dashboard: DATABASE_URL from the
    environment, else from .streamlit/secrets.toml (gitignored)."""
    import os
    import tomllib
    from pathlib import Path
    secrets = Path(".streamlit/secrets.toml")
    if not os.environ.get("DATABASE_URL") and secrets.exists():
        url = tomllib.loads(secrets.read_text(encoding="utf-8")).get("DATABASE_URL")
        if url:
            os.environ["DATABASE_URL"] = url


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db")
    sub.add_parser("demo")
    list_cmd = sub.add_parser("list")
    list_cmd.add_argument("--min-score", type=float, default=0)
    list_cmd.add_argument("--status", default=None)
    fetch_cmd = sub.add_parser("fetch", help="Fetch every source and store the results")
    fetch_cmd.add_argument("--skip-sensitive", action="store_true")
    fetch_cmd.add_argument("--trigger", default="cli")
    fetch_cmd.add_argument("--tier", choices=("full", "fast"), default="full",
                           help="fast: only the light sources, for the every-30-minutes workday run")
    fetch_cmd.add_argument("--skip-source", action="append", default=[], metavar="NAME",
                           help="Leave out a source by its name, e.g. CzyJestEldorado (repeatable)")
    summary_cmd = sub.add_parser("notify-summary", help="E-mail a summary of the offers new in the last fetch")
    summary_cmd.add_argument("--hours", type=int, default=24,
                             help="Fallback window when the last fetch's new ids aren't recorded")
    summary_cmd.add_argument("--only-if-new", action="store_true",
                             help="Send nothing when the last fetch found no new offers (the fast runs)")
    tailor_cmd = sub.add_parser("tailor-cv", help="Tailor ../CV/cv.html to one offer with the Claude Code CLI")
    tailor_cmd.add_argument("offer", help="The offer's URL (as stored in JOffers, or any offer page)")
    tailor_cmd.add_argument("--model", default=None, help="Claude model for `claude -p` (default: the CLI's)")
    tailor_cmd.add_argument("--keep-status", action="store_true", help="Don't set the offer's status to CV generated")
    sub.add_parser("daily-due", help="Print 'yes' unless this slot's (11:00 / 18:00) fetch already ran")
    args = parser.parse_args()

    if args.cmd == "tailor-cv":
        _local_database_url()
    store = JobStore()

    if args.cmd == "init-db":
        print("Database initialized.")
    elif args.cmd == "daily-due":
        # Only a full fetch counts: the fast runs in between leave out some sources.
        print("no" if daily_fetch_done(store.get_meta("last_full_fetch_at")) else "yes")
    elif args.cmd == "demo":
        cfg = load_config(overrides=overrides_from_meta(store.get_all_meta()))
        created = 0
        for job in SampleSource().fetch():
            if store.upsert(score_job(job, cfg)):
                created += 1
        print(f"Processed {created} new demo jobs.")
    elif args.cmd == "fetch":
        results = run_fetch(store, args.trigger, skip_sensitive=args.skip_sensitive, skip_names=args.skip_source,
                            tier=args.tier)
        for r in results:
            status = f"{r.error_type}: {r.error}" if r.error else "ok"
            print(f"{r.name:<18} candidates={r.candidates:<4} inserted={r.inserted:<4} "
                  f"rejected={r.rejected:<4} expired={r.expired:<4} {r.seconds:6.1f}s  {status}")
    elif args.cmd == "tailor-cv":
        from .tailor_cv import TailorError, find_offer, mark_cv_generated, offer_from_page, tailor
        offer = find_offer(store, args.offer)
        if offer is None:
            print("Offer not in JOffers - reading its page instead.")
            offer = offer_from_page(args.offer)
        print(f"Tailoring the CV to: {offer.get('title')} - {offer.get('company')} (takes a minute or two)")
        try:
            result = tailor(offer, model=args.model)
        except TailorError as exc:
            raise SystemExit(f"Not saved: {exc}")
        print(f"HTML:  {result.html_path}\nPDF:   {result.pdf_path or '(Chrome not found - open the HTML and print)'}"
              f"\nNotes: {result.notes_path}\n\n{result.notes}")
        if offer.get("external_id") and not args.keep_status and mark_cv_generated(store, offer, result.pdf_path or result.html_path):
            print("\nStatus set to CV generated.")
    elif args.cmd == "notify-summary":
        rows, hours = summary_rows(store, args.hours)
        if args.only_if_new and (not rows or hours):
            # Nothing new, or this run failed before recording its new ids: no e-mail.
            print("No new offers - nothing sent.")
            return
        # A fetch that never finished records no run; yesterday's failed sources would mislead.
        last_run = store.last_fetch_run() if fetch_is_current(store) else None
        subject, text, html = build_summary(rows, last_run, hours=hours)
        if send_email(subject, text, html):
            print(f"Sent: {subject}")
        else:
            print("SMTP_USER/SMTP_PASSWORD not set — summary not sent:")
            print(subject)
            print(text)
    else:
        for job in store.list(args.min_score, args.status):
            print(
                f"[{job['score']:>5}] {job['title']} — {job['company']}\n"
                f"  {job['location']} | {job['contract']} | freshness +{job.get('recency_score', 0)} | "
                f"{job.get('application_status', 'TO_REVIEW')}\n  {job['url']}"
            )


if __name__ == "__main__":
    main()
