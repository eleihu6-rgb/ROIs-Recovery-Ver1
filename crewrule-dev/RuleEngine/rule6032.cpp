#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule6032/CheckMaxConsecutiveWOCLDutyRule.h"
#include "RuleFactory.h"


bool LegalityChecker::CheckMaxConsecutiveWOCLDuty(RULE_LEGALITY * pCrew, const DBRule* singleRule) {
	CheckMaxConsecutiveWOCLDutyRule* rule = _ruleFactory->GetCheckRule<CheckMaxConsecutiveWOCLDutyRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(pCrew);

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//if (roster->idcrew == "30002" && roster->pairing) {
		//	printf("");
		//}
		rosters.emplace_back(roster.get());
	}
	return rule->CheckRule(rosters);
}