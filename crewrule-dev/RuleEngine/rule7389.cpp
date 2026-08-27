/**
 * @file rule7389.cpp
 * @brief 7389法规调用函数 - 课程连续X天之后要安排Y天休假
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-08
**/

#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule/rule7389/LimitTrainingConsecutiveDaysFor5JRule.h"
#include "RuleFactory.h"

bool LegalityChecker::checkTrainingConsecutiveDaysFor5J(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0) {
		return true;
	}

	LimitTrainingConsecutiveDaysFor5JRule* rule = _ruleFactory->GetCheckRule<LimitTrainingConsecutiveDaysFor5JRule>();
	if (rule == nullptr) {
		return true;
	}

	rule->setRuleLegality(pCrew);
	return rule->CheckRule(_dbData->crewList[pCrew->crewIndex]);
}