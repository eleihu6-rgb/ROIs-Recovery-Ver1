#include "RuleEngine.h"
#include "CrewDB.h"
#include "rule7222/CheckMaxLayoversInTripsForPairingRule.h"
#include "RuleFactory.h"


bool LegalityChecker::CheckMaxLayoversInTripsForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {

	CheckMaxLayoversInTripsForPairingRule* rule = _ruleFactory->GetCheckRule<CheckMaxLayoversInTripsForPairingRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}