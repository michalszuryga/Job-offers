from datetime import datetime, timedelta
from ..models import Job
class SampleSource:
    name="demo"
    def fetch(self):
        now=datetime.now()
        return [Job("Senior QA Engineer","Demo Health","https://example.com/health",self.name,"Remote healthcare SaaS. API testing, Postman, Playwright, TypeScript, SQL, GitHub and exploratory testing. English.","Remote EU",True,"B2B","", "", "", "Senior",now-timedelta(hours=2)), Job("Junior QA Tester","Demo Corp","https://example.com/junior",self.name,"Onsite junior manual tester. Internship. Polish only.","Warsaw",False,"Employment","", "", "", "Junior",now-timedelta(hours=4))]
