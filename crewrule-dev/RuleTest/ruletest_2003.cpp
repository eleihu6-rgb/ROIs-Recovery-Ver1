/**
1. 测试rule 2003 (ptn检查)
2. 关键参数：最大小时数、最大duty数、最长日历日数、最大飞时、是否允许回基地
3. 检查逻辑
	a. OpenProject搜索 '2003 rule'
	b. OP#2124: 检查ptn最大长度(小时)、最大duty数(排除空天)、是否允许中间回基地、最大飞时、最长日历日
	c. OP#2346: 按ptn.base限制可过夜航站
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

#define RULE_FUNC 2003

//运行单个 case
bool test_2003_case(LegalityChecker& ruleEngine, ruleTestCase& caseData);
//解析 case数据到 ruleParam
rule2003* parseRule2003(ruleTestCase& caseData);

//
//main of 2003 testing
bool test_rule_2003(LegalityChecker& ruleEngine) {
	bool allOK = true;
	
	vector<ruleTestCase> cases = loadRuleTestCase("rule_case_2003.ini");
	for (auto& item : cases) {
		if (!test_2003_case(ruleEngine, item)) {
			allOK = false;
		}
	}

	return allOK;
}

//
//运行单个 case
bool test_2003_case(LegalityChecker& ruleEngine, ruleTestCase& caseData) {
	//
	//parse data
	bool expectSuccess = toUpper(caseData.getValue("expectLegal")) == "Y";
	rule2003* ruleItem = parseRule2003(caseData);
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

rule2003* parseRule2003(ruleTestCase& caseData) {
	rule2003* ruleItem = new rule2003;
	ruleItem->base = caseData.getValue("base");
	ruleItem->maxPgLength = strToInt(caseData.getValue("maxPgHours"), -1);
	ruleItem->maxDutiesinPG = strToInt(caseData.getValue("maxDuties"), -1);
	ruleItem->allowReturnBaseinDuty = caseData.getValue("allowDutyReturnBase");
	ruleItem->maxBlh = caseData.getValue("maxBLH");
	ruleItem->strMaxDays = caseData.getValue("maxCalendarDays");
	ruleItem->allowableLayoverStation = vector<string>({"*"});

	return ruleItem;
}