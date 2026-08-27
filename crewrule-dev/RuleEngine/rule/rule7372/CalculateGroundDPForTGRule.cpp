/**
 * @file CalculateGroundDPForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/

#include "../RuleSytem.h"
#include "CalculateGroundDPForTGRule.h"
#include "../constant/Constants.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"

long CalculateGroundDPForTGRule::Calculate(SharedPtr<ROSTER> roster) {
	
	long dp = -1;
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam._assignmentGroups.empty() && !ruleParam._assignmentGroupsMatch.Match(*roster)) {
			continue;
		}
			
		if (find(ruleParam._assignments.begin(), ruleParam._assignments.end(), roster->qualifier) == ruleParam._assignments.end()) {
			continue;
		}

		long sbyDuration = static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

		if (sbyDuration >= ruleParam._limit * 60) {
			dp = (long)(max(0L, sbyDuration - ruleParam._offset * 60) * ruleParam._rate);
		}
		else {
			dp = sbyDuration * ruleParam._rate;
		}

		
	}
	return dp;
}

void CalculateGroundDPForTGRule::CalculateDP(SharedPtr<ROSTER> roster) {
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam._assignmentGroups.empty() && !ruleParam._assignmentGroupsMatch.Match(*roster)) {
			continue;
		}

		if (find(ruleParam._assignments.begin(), ruleParam._assignments.end(), roster->qualifier) == ruleParam._assignments.end()) {
			continue;
		}

		long duration = static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

		long dp = 0;
		if (duration >= ruleParam._limit * 60) {
			dp = (long)(max(0L, duration - ruleParam._offset * 60) * ruleParam._rate);
		}
		else {
			dp = duration * ruleParam._rate;
		}

		roster->dpMinutes = (dp / 60);
	}
}




void CalculateGroundDPForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateGroundDPForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
