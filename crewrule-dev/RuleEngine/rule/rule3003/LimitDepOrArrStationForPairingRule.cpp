/**
 * @file LimitDepOrArrStationForPairingRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-19
**/

#include "../RuleSytem.h"
#include "LimitDepOrArrStationForPairingRule.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"

bool LimitDepOrArrStationForPairingRule::CheckRule(const Pairing* pairing) const {
	if (_ruleParams.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(pairing, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				return passAllRule;
			}
		}

	}
	return passAllRule;
}

bool LimitDepOrArrStationForPairingRule::CheckRule(const Pairing* pairing, const LimitDepOrArrStationForPairingRuleParam& ruleParam) const {
	bool valid = true;
			
	if (ruleParam.MatchParam(pairing)) {
        if (!ruleParam.CheckParam(pairing)) {
			valid = false;
			if (!this->IsCheckAllRule()) {
				return valid;
			}
			ThrowRuleViolation(pairing, ruleParam);
		}
	}
	return valid;
}

void LimitDepOrArrStationForPairingRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitDepOrArrStationForPairingRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitDepOrArrStationForPairingRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitDepOrArrStationForPairingRule::ThrowRuleViolation(const Pairing* pairing, const LimitDepOrArrStationForPairingRuleParam& ruleParam) const {
	//Pairing的起飞或降落站点不在基地列表中
	std::string msg = "The departure or arrival station of the pairing is not a base station ({0:bases}).";
	msg = StringUtils::Format(msg, ruleParam._bases);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitDepOrArrStationForPairingRule::RuleFuncId;
	rv->pairingId = pairing->getDbId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, pairing->getDbId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Pairing*>(pairing), msg);
	}
	rv->startDTUtc = pairing->getStartTimeUtcAct();
	rv->endDTUtc = pairing->getEndTimeUtcAct();
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}
