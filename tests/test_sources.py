from job_finder.sources.nofluff import NoFluffSource
from job_finder.sources.pracuj import PracujSource
from job_finder.sources.justjoin import JustJoinSource


def test_source_names():
    assert NoFluffSource().name == "No Fluff Jobs"
    assert PracujSource().name == "Pracuj.pl"
    assert JustJoinSource().name == "JustJoin.IT"
