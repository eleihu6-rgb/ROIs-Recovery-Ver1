/**
 * @file CalculateGroundRosterMinRestFor5JRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-05-18
**/

#include "../RuleSytem.h"
#include "CalculateGroundRosterMinRestFor5JRule.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "../utils/PhaseUtils.h"	

void CalculateGroundRosterMinRestFor5JRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (rosters.empty() || _ruleParams.empty()) {
		return;
	}
	for (const auto& roster : rosters) {
		if (roster->pairing != nullptr) {
			continue;
		}
		CalculateDuty(const_cast<ROSTER*>(roster));
	}
}

void CalculateGroundRosterMinRestFor5JRule::CalculateDuty(ROSTER* roster) {
	for (const auto& ruleParam : _ruleParams) {

		if (roster != nullptr && !PhaseUtils::IsChecked(roster, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (roster != nullptr && roster->isMergeDpWithNext) {
			//特殊处理 roster->isMergeDpWithNext==true，表示当前Ground Roster的DP被合并到下一个Roster,则当前Ground Roster的MinRest强制设置为0
			if (roster->pairing == nullptr) {
				roster->endUtc = roster->restStrUtc;
				roster->endLoc = roster->restStrLoc;
				roster->actEndUtc = roster->actRestStrUtc;
				roster->actEndLoc = roster->actRestStrLoc;
				roster->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, 0, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
				break;
			}
		}

		if (roster != nullptr && ruleParam.MatchParam(*roster)) {
			if (ruleParam._minRestMinutes >= 0) {
				roster->endUtc = roster->restStrUtc + (time_t)60 * ruleParam._minRestMinutes;
				roster->endLoc = roster->restStrLoc + (time_t)60 * ruleParam._minRestMinutes;
				roster->actEndUtc = roster->actRestStrUtc + (time_t)60 * ruleParam._minRestMinutes;
				roster->actEndLoc = roster->actRestStrLoc + (time_t)60 * ruleParam._minRestMinutes;
				roster->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._minRestMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
				break;
			}
		}
	}
}

void CalculateGroundRosterMinRestFor5JRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(GroundRosterMinRestFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(GroundRosterMinRestFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}