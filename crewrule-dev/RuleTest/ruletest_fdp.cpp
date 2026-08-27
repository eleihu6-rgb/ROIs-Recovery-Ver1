/**
1. 测试FDP计算
2. 关键参数：任务类型、FDP上下限、BLH上下限、Landing上下限、休息室、是否跨午夜
3. 检查逻辑
	a. OpenProject搜索 '2124 rule'
	b. OP#2124: 针对目标duty，判断是否匹配2124 ruleParam，若匹配则检查实际休息是否复合 minRest

*/
#include <iostream>
#include <stdarg.h>
#include <memory>
#include "ruletest.h"
#include "CrewDB.h"
#include "RuleEngine.h"
#include "ruletest_util.h"
#include "UtilFunc.h"
#include "ruletest_case.h"
#include "RuleParams.h"
#include "CustomBiz/CustomBiz.h" //for FDP calc

using namespace std;

#define RULE_FUNC "'FDP'"


void parseRule2107And2102(ruleTestCase& caseData);
bool test_fdp_case(LegalityChecker& ruleEngine, ruleTestCase& caseData);

bool test_rule_fdp(LegalityChecker& ruleEngine) {

	bool allOK = true;

	vector<ruleTestCase> cases = loadRuleTestCase("rule_case_fdp.ini");
	for (auto& item : cases) {
		if (!test_fdp_case(ruleEngine, item)) {
			allOK = false;
		}
	}

	return allOK;
}

bool test_fdp_case(LegalityChecker& ruleEngine, ruleTestCase& caseData) {
	parseRule2107And2102(caseData);
	//
	//print
	cout << "\n----\n"
		<< "Check [" << RULE_FUNC << "] case " << caseData.caseName << endl;
	caseData.print();

	string expectFdpStr = caseData.getValue("expectFDP");
	int expectFdp = hhmmStrToMinutes(expectFdpStr);

	//duties
	Pairing* pg = makePairing(caseData.ptnSegStr, &ruleEngine);

	///TEST
	test_log_segs_and_nodes("TEST", pg);

	//calc FDP
	calculatePairingDutyTimes(pg, ruleEngine.getCrewContext().get());
	int calcFdp = pg->getDuty(0)->getFDPInSecs() / 60;

	if (calcFdp != expectFdp) {
		cout << "ERROR: " << RULE_FUNC << " case"
			<< ", expectFdp=" << expectFdp
			<< ", calcFdp=" << calcFdp
			<< endl;
	}
	else {
		cout << "OK: " << RULE_FUNC << " case"
			<< ", expectFdp=" << expectFdp
			<< ", calcFdp=" << calcFdp
			<< endl;
	}
	cout << endl;
	//
	//retun
	return calcFdp == expectFdp;
}


void parseRule2107And2102(ruleTestCase& caseData) {
	RuleParams* rp = RuleParams::GetInstancePtr();

	//rule 2107, FDP
	rp->bAugAllowed = (caseData.getBoolValue("IS FDP AUG ALLOWED WHILE BLH NOT AUG"));
	rp->bPickupCount = (caseData.getBoolValue("IS PICKUP COUNT"));
	rp->bDropoffCount = (caseData.getBoolValue("IS DROPOFF COUNT"));
	rp->bPreFerryCount = (caseData.getBoolValue("IS PRE-FERRY COUNT"));
	rp->bIncludeLastDHD = (caseData.getBoolValue("IS POST-FERRY COUNT"));
	rp->bIncludeCO = (caseData.getBoolValue("INCLUDE CHECK OUT"));
	rp->bIncludeCI = (caseData.getBoolValue("INCLUDE CHECK IN"));
	rp->bIncludeLongTransitCO = (caseData.getBoolValue("INCLUDE LT CHECK OUT"));

	//rule 2102, long transit
	string pBrief = caseData.getValue("PSEUDO BRIEF");
	string pDeBrief = caseData.getValue("PSEUDO DEBRIEF");
	string pPickup = caseData.getValue("PICK UP");
	string pDropoff = caseData.getValue("DROP OFF");
	string pMaxTurn=caseData.getValue("MAX TURNTIME");

	long_transit* longTransit = new long_transit();
	longTransit->airport = "*";
	longTransit->division = "*";
	longTransit->inbound = caseData.getValue("INBOUND");
	longTransit->outbound = caseData.getValue("OUTBOUND");
	longTransit->in_assignment = caseData.getValue("IN ASSIGNMENT");
	longTransit->out_assignment = caseData.getValue("OUT ASSIGNMENT");
	longTransit->maxTurnTimeMins = hhmmStrToMinutes(pMaxTurn);
	longTransit->pseudoCI = hhmmStrToMinutes(pBrief);
	longTransit->pseudoCO = hhmmStrToMinutes(pDeBrief);
	longTransit->pseudoPickup = hhmmStrToMinutes(pPickup);
	longTransit->pseudoDropoff = hhmmStrToMinutes(pDropoff);
	split(caseData.getValue("FLEETS"), '|', longTransit->fleetsVec);

	for (auto& i : rp->split_duty) {
		delete i;
	}
	rp->split_duty.clear();
	rp->split_duty.push_back(longTransit);
}