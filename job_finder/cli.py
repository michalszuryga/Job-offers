import argparse

from .config import load_config
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
    args = parser.parse_args()

    store = JobStore()
    cfg = load_config()

    if args.cmd == "init-db":
        print("Database initialized.")
    elif args.cmd == "demo":
        created = 0
        for job in SampleSource().fetch():
            if store.upsert(score_job(job, cfg)):
                created += 1
        print(f"Processed {created} new demo jobs.")
    else:
        for job in store.list(args.min_score, args.status):
            print(
                f"[{job['score']:>5}] {job['title']} — {job['company']}\n"
                f"  {job['location']} | {job['contract']} | freshness +{job.get('recency_score', 0)} | "
                f"{job.get('application_status', 'NEW')}\n  {job['url']}"
            )


if __name__ == "__main__":
    main()
