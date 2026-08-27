#include <iostream>
#include "RecencyMgr.h"
#include "UtilFunc.h"

shared_ptr<CrewRecency> makeRecency(time_t utc, string crewId, string dep, string arv, string fleet, string actingRank, string role) {
	shared_ptr<CrewRecency> item(new CrewRecency());
	item->crewDateUtc = utc;
	item->idcrew = crewId;
	item->depAirport = dep;
	item->arvAirport = arv;
	item->fleet = fleet;
	item->actingRank = actingRank;
	item->role = role;
	return item;
}

void test_recency() {
	vector<shared_ptr<CrewRecency>> list = {
		makeRecency(utcStrToUtc("2017-1-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", ""),
		makeRecency(utcStrToUtc("2017-1-1 13:30"), "AN00001", "PEK", "SHA", "320", "CA", ""),
		makeRecency(utcStrToUtc("2017-3-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", ""),
		makeRecency(utcStrToUtc("2017-3-1 13:30"), "AN00001", "PEK", "SHA", "320", "CA", ""),
		makeRecency(utcStrToUtc("2017-2-1 10:30"), "AN00001", "SHA", "PEK", "738", "FO", ""),
		makeRecency(utcStrToUtc("2017-2-1 13:30"), "AN00001", "SHA", "FOC", "320", "FO", "")
	};

	RecencyMgr mgr;
	mgr.initCrewRecency(list);
	mgr.print();
	time_t lastRecency = mgr.getLastestRecencyBeforeUtc(utcStrToUtc("2017-3-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", "");
	cout << "lastRecency=" << utcToUtcString(lastRecency) << endl << endl;

	cout << "addRecency 2017-2-20 10:30 \n";
	mgr.addRecency(makeRecency(utcStrToUtc("2017-2-20 10:30"), "AN00001", "PEK", "SHA", "738", "CA", ""));
	mgr.print();
	time_t lastRecencyAfterAdd = mgr.getLastestRecencyBeforeUtc(utcStrToUtc("2017-3-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", "");
	cout << "lastRecency=" << utcToUtcString(lastRecencyAfterAdd) << endl;

	cout << "removeRecency 2017-2-20 10:30 \n";
	mgr.removeRecency(utcStrToUtc("2017-3-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", "");
	mgr.print();
	time_t lastRecencyAfterRemove = mgr.getLastestRecencyBeforeUtc(utcStrToUtc("2017-3-1 10:30"), "AN00001", "PEK", "SHA", "738", "CA", "");
	cout << "lastRecency=" << utcToUtcString(lastRecencyAfterRemove) << endl;

	cout << "removeNotInScenario 0\n";
	mgr.removeRecencyNotInScenario(0);
	mgr.print();
}