from job_finder.sources.nofluff import NoFluffSource
from job_finder.sources.pracuj import PracujSource
from job_finder.sources.justjoin import JustJoinSource
from job_finder.sources.remoteok import RemoteOKSource
from job_finder.sources.weworkremotely import WeWorkRemotelySource
from job_finder.sources.bulldogjob import BulldogJobSource
from job_finder.sources.testdevjobs import TestDevJobsSource
from job_finder.sources.eldorado import EldoradoSource


def test_source_names():
    assert NoFluffSource().name == "No Fluff Jobs"
    assert PracujSource().name == "Pracuj.pl"
    assert JustJoinSource().name == "JustJoin.IT"
    assert RemoteOKSource().name == "RemoteOK"
    assert WeWorkRemotelySource().name == "We Work Remotely"
    assert BulldogJobSource().name == "Bulldogjob"
    assert TestDevJobsSource().name == "TestDevJobs"
    assert EldoradoSource().name == "CzyJestEldorado"


def test_rate_limit_sensitive_sources_are_flagged():
    assert NoFluffSource().sensitive is True
    assert PracujSource().sensitive is True
    assert EldoradoSource().sensitive is True
    assert JustJoinSource().sensitive is False
    assert RemoteOKSource().sensitive is False
    assert WeWorkRemotelySource().sensitive is False
    assert BulldogJobSource().sensitive is False
    assert TestDevJobsSource().sensitive is False
