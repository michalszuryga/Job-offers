import argparse

from .collector import run_fetch
from .config import load_config, overrides_from_meta
from .notify import build_summary, send_email
from .scoring import score_job
from .storage import JobStore
from .sources.sample import SampleSource


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
    summary_cmd = sub.add_parser("notify-summary", help="Push a summary of offers new in the last N hours")
    summary_cmd.add_argument("--hours", type=int, default=24)
    args = parser.parse_args()

    store = JobStore()

    if args.cmd == "init-db":
        print("Database initialized.")
    elif args.cmd == "demo":
        cfg = load_config(overrides=overrides_from_meta(store.get_all_meta()))
        created = 0
        for job in SampleSource().fetch():
            if store.upsert(score_job(job, cfg)):
                created += 1
        print(f"Processed {created} new demo jobs.")
    elif args.cmd == "fetch":
        results = run_fetch(store, args.trigger, skip_sensitive=args.skip_sensitive)
        for r in results:
            status = f"{r.error_type}: {r.error}" if r.error else "ok"
            print(f"{r.name:<18} candidates={r.candidates:<4} inserted={r.inserted:<4} "
                  f"rejected={r.rejected:<4} expired={r.expired:<4} {r.seconds:6.1f}s  {status}")
    elif args.cmd == "notify-summary":
        subject, text, html = build_summary(store.new_since(args.hours), store.last_fetch_run(), hours=args.hours)
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
