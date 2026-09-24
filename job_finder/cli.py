import argparse
from .config import load_config
from .scoring import score_job
from .storage import JobStore
from .sources.sample import SampleSource

def main():
    p=argparse.ArgumentParser(); s=p.add_subparsers(dest="cmd",required=True)
    s.add_parser("init-db"); s.add_parser("demo"); q=s.add_parser("list"); q.add_argument("--min-score",type=float,default=0)
    a=p.parse_args(); store=JobStore(); cfg=load_config()
    if a.cmd=="init-db": print("Database initialized.")
    elif a.cmd=="demo":
        n=0
        for j in SampleSource().fetch():
            if store.upsert(score_job(j,cfg)): n+=1
        print(f"Processed {n} new demo jobs.")
    else:
        for j in store.list(a.min_score): print(f"[{j['score']:>5}] {j['title']} — {j['company']}\n        {j['location']} | {j['contract']} | {j['url']}")
if __name__=="__main__": main()
