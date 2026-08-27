/**
 * @file rule7388.cpp
 * @brief 7388法规调用函数 - Course只能安排在指定weekday
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-07
**/

#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule/rule7388/LimitCourseWeekdayFor5JRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkCourseWeekdayFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return true;
	}

	LimitCourseWeekdayFor5JRule* rule = _ruleFactory->GetCheckRule<LimitCourseWeekdayFor5JRule>();
	if (rule == nullptr) {
		return true;
	}

	rule->setRuleLegality(pCrew);
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]);
}