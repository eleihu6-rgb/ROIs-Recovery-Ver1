/**
1. 测试rule 2124 (ptn检查)
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

using namespace std;

#define RULE_FUNC 2124

//运行单个 case
bool test_2124_case(LegalityChecker& ruleEngine, ruleTestCase& caseData);
//解析 case数据到 ruleParam
rule2124* parseRule2124(ruleTestCase& caseData);

//
//main of 2124 testing
bool test_rule_2124(LegalityChecker& ruleEngine) {
	bool allOK = true;

	vector<ruleTestCase> cases = loadRuleTestCase("rule_case_2124.ini");
	for (auto& item : cases) {
		if (!test_2124_case(ruleEngine, item)) {
			allOK = false;
		}
	}

	return allOK;
}

//
//运行单个 case
bool test_2124_case(LegalityChecker& ruleEngine, ruleTestCase& caseData) {
	//
	//parse data
	bool expectSuccess = toUpper(caseData.getValue("expectLegal")) == "Y";
	rule2124* ruleItem = parseRule2124(caseData);
	//
	//print
	cout << "\n----\n"
		<< "Check [" << RULE_FUNC << "] case " << caseData.caseName << endl;
	caseData.print();
	//
	//replace rule 
	replaceRuleItem(ruleItem, RULE_FUNC, ruleEngine.getDataContext());

	//duties
	Pairing* pg = makePairing(caseData.ptnSegStr, &ruleEngine);

	ruleEngine.cleanViolations();
	bool success = ruleEngine.checkPGRules(pg, { RULE_FUNC });
	success = ruleEngine.getRuleViolations().empty();
	if (!success) {
		vector<RULE_VIOLATION*> message = ruleEngine.getRuleViolations();
		for (auto m : message) {
			cout << "Violation: " << m->violation_msg << endl;
		}
	}
	cout << endl;
	if (success != expectSuccess) {
		cout << "ERROR: " << RULE_FUNC << " case"
			<< ", expect=" << (expectSuccess ? "legal" : "illegal")
			<< ", realResult=" << (success ? "legal" : "illegal")
			<< endl;
	}
	else {
		cout << "OK: " << RULE_FUNC << " case"
			<< ", expect=" << (expectSuccess ? "legal" : "illegal")
			<< ", realResult=" << (success ? "legal" : "illegal")
			<< endl;
	}
	cout << endl;
	return success == expectSuccess;
}

rule2124* parseRule2124(ruleTestCase& caseData) {
	rule2124* ruleItem = new rule2124;
	ruleItem->composition = caseData.getValue("Composition");
	split(caseData.getValue("Assignments"), ruleItem->assignments, "|");
	ruleItem->bunk = caseData.getValue("With_Bunk");

	ruleItem->landingLower = strToInt(caseData.getValue("Landing_Times_Lower"), 0);
	ruleItem->landingUpper = strToInt(caseData.getValue("Landing_Times_Upper"), 99);
	ruleItem->blhLower = hhmmToMinutes(caseData.getValue("BLH Lower").c_str());
	ruleItem->blhUpper = hhmmToMinutes(caseData.getValue("BLH Upper").c_str());
	ruleItem->fdpLower = hhmmToMinutes(caseData.getValue("FDP Lower").c_str());
	ruleItem->fdpUpper = hhmmToMinutes(caseData.getValue("FDP Upper").c_str());

	ruleItem->crossMidnight = caseData.getValue("is Cross Midnight");
	ruleItem->delayed = caseData.getValue("is Delay");
	ruleItem->minRest = hhmmToMinutes(caseData.getValue("Min Rest").c_str());
	
	return ruleItem;
}