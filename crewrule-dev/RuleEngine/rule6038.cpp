#include "RuleEngine.h"

#include "CrewDB.h"
#include "StringUtil.h"
#include "rule6038/AdaptionPeriod4MaxFDPRule.h"
#include "RuleFactory.h"

// Added by Aspeb on 2024.8.7 for QQ Adaption peirod calcuation about the pairings that their duty qty reached the 
// maxconsecutive qty, then need a adaption period to rest and change their status from Unknow to Acculimatized
bool LegalityChecker::checkAdaptionPeriod4MaxConsecutiveDuty(Pairing* pairing) {
	AdaptionPeriod4MaxFDPRule* rule = _ruleFactory->GetCalcRule<AdaptionPeriod4MaxFDPRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(nullptr);
	return rule->CheckRule(pairing);
}

bool LegalityChecker::checkAdaptionPeriod4MaxConsecutiveDuty(RULE_LEGALITY* pCrew) {
	if (pCrew->crewIndex < 0)
	{
		return true;
	}

	AdaptionPeriod4MaxFDPRule* rule = _ruleFactory->GetCheckRule<AdaptionPeriod4MaxFDPRule>();
	if (rule == nullptr) {
		return true;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		rosters.emplace_back(roster.get());
	}
	rule->setRuleLegality(pCrew);
	return rule->CheckRule(rosters);
}