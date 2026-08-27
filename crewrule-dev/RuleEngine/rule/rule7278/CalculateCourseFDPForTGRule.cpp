/**
 * @file CalculateCourseFDPForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/

#include "../RuleSytem.h"
#include "CalculateCourseFDPForTGRule.h"
#include "../constant/Constants.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"

long CalculateCourseFDPForTGRule::Calculate(SharedPtr<ROSTER> roster) {

	if (roster->pairing)
		return 0;

	long fdp = 0;
	for (const auto& ruleParam : _ruleParams) {
		
		if (ruleParam.MatchCourse(roster)) {
			const auto& rosterFdp = ruleParam.GetRosterGroundFDP(roster);
			return rosterFdp;
		}

	}
	return fdp;
}

long CalculateCourseFDPForTGRule::Calculate(Duty* duty, const SharedPtr<ROSTER>& roster) {
	if (!roster->pairing)
		return 0;

	long fdp = duty->getActualFDP();;
	for (const auto& ruleParam : _ruleParams) {
		if (ruleParam.MatchCourse(roster)) {
			const auto& dutyFdp = ruleParam.GetDutyFDP(duty);
			return dutyFdp;
		}
	}
	return fdp;
}

void CalculateCourseFDPForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateCourseFDPForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}