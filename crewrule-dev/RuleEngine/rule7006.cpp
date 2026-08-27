#include "RuleEngine.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "rule7006/CalculateMandayFTCustomRule.h"
#include "RuleFactory.h"

double LegalityChecker::CalculateMandayFTCustom_TG(Segment* segment) {
	CalculateMandayFTCustomRule* rule = _ruleFactory->GetCalcRule<CalculateMandayFTCustomRule>();
	if (rule == nullptr) {
		return NULL;
	}
	
	return rule->Calculate(segment);
}
