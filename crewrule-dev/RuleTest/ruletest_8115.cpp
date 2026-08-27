/**
1. 测试rule 8115
2. 关键参数：连飞天数限制、末尾日最大降落时间(maxSta, 格式hhmm)
3. 检查逻辑
	a. ptn是否达到连飞天数限制，若未达到则忽略不检查
	b. ptn是否超过连飞天数限制，若是则违规
	c. ptn若刚好连飞天数，则检查末尾seg set是否超过maxSta，若超过则警告
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

#define OFFSET 8 // Asia/Shanghai
#define RULE_FUNC 8115


//解析ruleParam
rule8115* parseRule8115(ruleTestCase& caseData);

//
//test cases
bool test_8115_case(LegalityChecker& ruleEngine, ruleTestCase& caseData);

//
//main of 8115 testing
bool test_rule_8115(LegalityChecker& ruleEngine) {
	bool allOK = true;

	vector<ruleTestCase> cases = loadRuleTestCase("rule_case_8115.ini");
	for (auto& item : cases) {
		if (!test_8115_case(ruleEngine, item)) {
			allOK = false;
		}
	}

	return allOK;
}

/*
//测试8115
//return 检查结果是否符合预期(expectSuccess)，符合返回true，否则返回false
*/
bool test_8115_case(LegalityChecker& ruleEngine, ruleTestCase& caseData) {
	//
	//parse data
	bool expectSuccess = toUpper(caseData.getValue("expectLegal")) == "Y";
	rule8115* ruleItem = parseRule8115(caseData);
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
	
	//check
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


rule8115* parseRule8115(ruleTestCase& caseData) {
	rule8115* ruleItem = new rule8115;
	ruleItem->base = caseData.getValue("BASE");
	ruleItem->rank = caseData.getValue("RANK");
	ruleItem->fleet = caseData.getValue("FLEET");
	split(caseData.getValue("DUTY ASSIGNMENTS").c_str(), '|', ruleItem->dutyAssignments);
	ruleItem->vrAddMaxConseutiveTime = strToInt(caseData.getValue("VR_ADD MAX CONSECUTIVE TIME"), -1);
	ruleItem->maxConseutiveTime = strToInt(caseData.getValue("MAX CONSECUTIVE TIME"), -1);
	ruleItem->Unit = caseData.getValue("UNIT");
	ruleItem->maxTimezoneGap = strToInt(caseData.getValue("MAX TIMEZONE GAP"), -1);
	ruleItem->lastDayMaxSta = caseData.getValue("LAST_DAY_MAX_STA");

	return ruleItem;
}
