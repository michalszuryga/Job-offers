from datetime import timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import requests
from bs4 import BeautifulSoup

from .base import JobSource
from .web_utils import HEADERS, clean, infer_remote, infer_seniority, looks_like_qa_role
from ..models import Job

# We Work Remotely has no dedicated QA/testing category (a per-category RSS
# for it 301-redirects — it doesn't exist), and a QA role can land in almost
# any of their categories, not just the programming ones. Its site-wide combined
# feed covers every category in one request (confirmed: Design, Product, DevOps,
# Customer Support, etc., not just the 3 programming categories used before),
# so filtering on title here is what actually finds QA roles, not the feed choice.
# The regular (non-RSS) site is Cloudflare-protected like Pracuj.pl/TheProtocol.it
# and was not viable to scrape — this feed is the only reliable access point.
FEEDS = [
    "https://weworkremotely.com/remote-jobs.rss",
]


class WeWorkRemotelySource(JobSource):
    name = "We Work Remotely"

    def __init__(self, feeds=None):
        self.feeds = feeds or FEEDS

    def fetch(self, known_urls=None):
        # No per-offer detail fetch here (the RSS item already carries the
        # full description), so there is nothing to save by skipping known URLs.
        self.errors = []
        jobs = []
        seen = set()
        candidates = 0

        for feed_url in self.feeds:
            try:
                response = requests.get(feed_url, headers=HEADERS, timeout=20)
                response.raise_for_status()
                root = ElementTree.fromstring(response.content)
            except Exception as exc:
                self.errors.append(f"{feed_url}: {type(exc).__name__}: {exc}")
                continue

            for item in root.iter("item"):
                candidates += 1
                link = clean(item.findtext("link") or "")
                if not link or link in seen:
                    continue
                raw_title = clean(item.findtext("title") or "")
                company, _, position = raw_title.partition(": ")
                if not position:
                    company, position = "", raw_title
                if not looks_like_qa_role(position):
                    continue
                seen.add(link)

                description = clean(BeautifulSoup(item.findtext("description") or "", "html.parser").get_text(" ", strip=True))
                region = clean(item.findtext("region") or "")
                published = None
                pub_date = item.findtext("pubDate")
                if pub_date:
                    try:
                        published = parsedate_to_datetime(pub_date)
                        if published.tzinfo is None:
                            published = published.replace(tzinfo=timezone.utc)
                    except (TypeError, ValueError):
                        published = None
                remote = infer_remote(" ".join((position, description, region)))
                if remote is None:
                    remote = True  # We Work Remotely only lists remote roles.

                jobs.append(Job(
                    title=position,
                    company=company,
                    url=link,
                    source=self.name,
                    description=description,
                    location=region or "Remote",
                    remote=remote,
                    contract="",
                    published_at=published,
                    seniority=infer_seniority(position + " " + description),
                ))

        self.candidates = candidates
        self.parsed = len(jobs)
        return jobs
