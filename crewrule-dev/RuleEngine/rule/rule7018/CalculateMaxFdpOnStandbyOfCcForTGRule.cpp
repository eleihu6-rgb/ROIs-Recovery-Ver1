/**
 * @file MaxFdpOnStandbyOfCcForTGRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <limits>
#include <algorithm>
#include "../RuleSytem.h"
#include "CalculateMaxFdpOnStandbyOfCcForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMaxFdpOnStandbyOfCcForTGRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	if (rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	std::map<const ROSTER*, const ROSTER*> rosterMap = RosterUtils::GetRosterMapForCalloutStandby(rosters, *RuleParams::GetInstancePtr()->getStandbyAssignments());
	for (auto& pair : rosterMap) {
		CalculateDuty(pair.first, pair.second, base);
	}
}

void CalculateMaxFdpOnStandbyOfCcForTGRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::string& base) {
	for (const auto & ruleParam : _ruleParams) {
		Duty* duty = flyRoster->pairing->getFirstDuty();
		long callinSBY_FDPMins = flyRoster->callinSBY_FDPMins;
		if (!CalculateDuty(standbyRoster, flyRoster, duty, callinSBY_FDPMins, base, ruleParam)) {
			break;
		}
	}
}

bool CalculateMaxFdpOnStandbyOfCcForTGRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const long callinSBY_FDPMins, const std::string& base, const MaxFdpOnStandbyOfCcForTGRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(standbyRoster, *duty, base)) {
		int standbyDuration = (int)callinSBY_FDPMins;
		if (!ruleParam.ignoreStandbyDurationAfterHHmm()) {
			standbyDuration = GetStandbyDurationAfterHHmm(standbyRoster, flyRoster, ruleParam);
		}
		int maxFDP = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
		int newMaxFDP = maxFDP - std::max(standbyDuration - ruleParam._gapOfStandbyDurationMinutes, 0);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
		next = false;
	}
	return next;
}

int CalculateMaxFdpOnStandbyOfCcForTGRule::GetStandbyDurationAfterHHmm(const ROSTER* standbyRoster, const ROSTER* flyRoster, const MaxFdpOnStandbyOfCcForTGRuleParam& ruleParam) const {
	//int callinSBY_FDPMins = static_cast<long>(flyRoster->actStrUtc - standbyRoster->actStrUtc) / 60;
	//这里standbyRoster和flyRoster在同一地点，时区相同
	int callinSBY_FDPMins = TimeUtils::GetDurationAfterHHmm(standbyRoster->actStrLoc, flyRoster->actStrLoc, ruleParam._standbyDurationAfterHHmmMinutes) / 60;
	return callinSBY_FDPMins;
}

void CalculateMaxFdpOnStandbyOfCcForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFdpOnStandbyOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFdpOnStandbyOfCcForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}