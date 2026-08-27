#include "RuleEngine.h"
#include "Utility.h"
#include "BasicRule.h"
#include "rule3003/LimitDepOrArrStationForPairingRule.h"
#include "RuleFactory.h"


bool LegalityChecker::checkDepOrArrStationForPairing(const Pairing* pairing, RULE_LEGALITY* ruleLegality) {
	if (this->_application == ROSTER_OPTIMIZER) {
		return true;
	}
	LimitDepOrArrStationForPairingRule* rule = _ruleFactory->GetCheckRule<LimitDepOrArrStationForPairingRule>();
	if (rule == nullptr) {
		return true;
	}
	rule->setRuleLegality(ruleLegality);
	return rule->CheckRule(pairing);
}


