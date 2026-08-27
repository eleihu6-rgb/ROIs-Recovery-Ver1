/**
 * @file CheckAllowedMultiSectorDutyForFreighterForSQRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckAllowedMultiSectorDutyForFreighterForSQRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckAllowedMultiSectorDutyForFreighterForSQRule::CheckRule(const Pairing* pairing) const {
	bool passAllRule = true;
	for (const auto& duty : pairing->getDutyVec()) {
		if (!CheckRule(duty)) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckAllowedMultiSectorDutyForFreighterForSQRule::CheckRule(const Duty* duty) const {
	bool hasApplicableWhitelist = false;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		if (!ruleParam.MatchServiceType(duty) || !ruleParam.MatchSegmentNumber(duty)) {
			continue;
		}

		hasApplicableWhitelist = true;
		if (ruleParam.MatchDutyAssignment(duty) && ruleParam.IsDutyPatternAllowed(duty)) {
			return true;
		}
	}

	if (!hasApplicableWhitelist) {
		return true;
	}

	if (this->_application == PAIRING_OPTIMIZER) {
		return false;
	}

	_ruleViolation.SetParam("route", _ruleParams.empty() ? "" : _ruleParams.front().GetDutyRoute(duty));
	ThrowRuleViolation(duty);
	return false;
}



void CheckAllowedMultiSectorDutyForFreighterForSQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckAllowedMultiSectorDutyForFreighterForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckAllowedMultiSectorDutyForFreighterForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckAllowedMultiSectorDutyForFreighterForSQRule::ThrowRuleViolation(const Duty* duty) const {
	string route = _ruleViolation.GetParam("route");
	std::string msg = "No duty pattern of the form ({0:route}) shall be permitted.";
	msg = StringUtils::Format(msg, route);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckAllowedMultiSectorDutyForFreighterForSQRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	rv->startDTUtc = duty->getStartTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;
	_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckAllowedMultiSectorDutyForFreighterForSQRule::RuleFuncId);

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("route", route));
	_ruleViolation.AddRuleViolations(rv);
}
