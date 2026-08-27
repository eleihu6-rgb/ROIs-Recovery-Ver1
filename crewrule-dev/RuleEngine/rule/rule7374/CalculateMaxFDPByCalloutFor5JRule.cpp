/**
 * @file CalculateMaxFDPByCalloutFor5JRule.cpp
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-28
**/

#include <algorithm>
#include "../RuleSytem.h"
#include "CalculateMaxFDPByCalloutFor5JRule.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "RuleParams.h"

void CalculateMaxFDPByCalloutFor5JRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (_ruleParams.empty() || rosters.empty()) {
		return;
	}

	std::map<const ROSTER*, const ROSTER*> rosterMap =
		RosterUtils::GetRosterMapForCalloutStandby(rosters, *RuleParams::GetInstancePtr()->getStandbyAssignments());
	for (const auto& pair : rosterMap) {
		CalculateDuty(pair.first, pair.second);
	}
}

void CalculateMaxFDPByCalloutFor5JRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster) {
	if (standbyRoster == nullptr || flyRoster == nullptr || flyRoster->pairing == nullptr) {
		return;
	}

	Duty* duty = flyRoster->pairing->getFirstDuty();
	if (duty == nullptr) {
		return;
	}

	for (const auto& ruleParam : _ruleParams) {
		if (!CalculateDuty(standbyRoster, flyRoster, duty, ruleParam)) {
			break;
		}
	}
}

bool CalculateMaxFDPByCalloutFor5JRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const MaxFDPByCalloutFor5JRuleParam& ruleParam) {
	if (!ruleParam.MatchParam(standbyRoster, flyRoster, *duty)) {
		return true;
	}

	const int deductionMinutes = CalculateDeductionMinutes(standbyRoster, flyRoster, ruleParam);
	if (deductionMinutes <= 0) {
		return false;
	}

	const int maxFDP = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	const int newMaxFDP = maxFDP - deductionMinutes;
	if (newMaxFDP > 0) {
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP,
			newMaxFDP,
			ruleParam.GetId(),
			ruleParam.GetRuleParamId(),
			ruleParam.GetOverrideAbility(),
			ruleParam.GetClassType(),
			ruleParam.GetDescription(),
			ruleParam.GetReference(),
			true);
	}
	else {
		Logger::getRuleLogger()->error("[ERROR] Adjust Max FDP by HSB callout failed. ruleId={}, newMaxFDP={}, pairingId={}, dutyId={}",
			ruleParam.GetId(), newMaxFDP, duty->getPairingId(), duty->getDutyId());
	}

	return false;
}

int CalculateMaxFDPByCalloutFor5JRule::CalculateIgnoredMinutes(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFDPByCalloutFor5JRuleParam& ruleParam) {
	if (!ruleParam.ShouldIgnoreOverlapByStandbyStart(standbyRoster)) {
		return 0;
	}

	if (ruleParam._standbyOverlapRangeStartMinutes < 0 || ruleParam._standbyOverlapRangeEndMinutes < 0) {
		return 0;
	}

	return TimeUtils::GetOverlapDuration(standbyRoster->getStartTimeUtcAct(),
		flyRoster->getStartTimeUtcAct(),
		ruleParam._standbyOverlapRangeStartMinutes,
		ruleParam._standbyOverlapRangeEndMinutes,
		0) / 60;
}

int CalculateMaxFDPByCalloutFor5JRule::CalculateDeductionMinutes(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFDPByCalloutFor5JRuleParam& ruleParam) {
	if (standbyRoster == nullptr || flyRoster == nullptr) {
		return 0;
	}

	const int totalStandbyMinutes = static_cast<int>(flyRoster->callinSBY_FDPMins);
	const int ignoredMinutes = CalculateIgnoredMinutes(standbyRoster, flyRoster, ruleParam);
	const int countedStandbyMinutes = std::max(0, totalStandbyMinutes - ignoredMinutes);
	return std::max(0, countedStandbyMinutes - ruleParam._standbyLengthThresholdMinutes);
}

void CalculateMaxFDPByCalloutFor5JRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFDPByCalloutFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}

	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFDPByCalloutFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
