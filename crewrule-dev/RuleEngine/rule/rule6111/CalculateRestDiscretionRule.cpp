/**
 * @file RestDiscretionRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateRestDiscretionRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateRestDiscretionRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	CalculateDuty(duties);
}

void CalculateRestDiscretionRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateRestDiscretionRule::CalculateDuty(vector<Duty*> duties) {
	if (duties.empty()) {
		return;
	}
	if (_ruleParams.empty()) {
		return;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(currDuty, nextDuty, ruleParam, base)) {
				break;
			}
		}
	}
}

bool CalculateRestDiscretionRule::CalculateDuty(Duty* currDuty, Duty* nextDuty, const RestDiscretionRuleParam& ruleParam, const std::string& base) {
	bool next = true;
	if (ruleParam.MatchParam(currDuty, nextDuty, base)) {
		next = false;
		if (currDuty->supportDiscretionType(DiscretionType::REST)) {
			if (ruleParam._reductionType.empty() || ruleParam._reductionType == "*" || ruleParam._reductionType == "R") {
				if (!ruleParam._restMaxReduction.empty() && (currDuty->getManualRestDiscretion() == 0 || currDuty->getManualRestDiscretion() < ruleParam._restMaxReductionMinutes)) {
					currDuty->setManualRestDiscretion(ruleParam._restMaxReductionMinutes);
				}
			}
			else {
				currDuty->setMinRest(ruleParam._restMaxReductionMinutes, true);
				currDuty->setMinRestAtBase(ruleParam._restMaxReductionMinutes, true);
				currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._restMaxReductionMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
			}

		}
	}
	return next;
}

void CalculateRestDiscretionRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestDiscretionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestDiscretionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}