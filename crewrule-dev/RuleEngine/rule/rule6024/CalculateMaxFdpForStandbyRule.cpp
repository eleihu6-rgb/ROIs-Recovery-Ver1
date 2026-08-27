/**
 * @file MaxFdpForStandbyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <limits>
#include "../RuleSytem.h"
#include "CalculateMaxFdpForStandbyRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMaxFdpForStandbyRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
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

void CalculateMaxFdpForStandbyRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::string& base) {
	for (const auto & ruleParam : _ruleParams) {
		Duty* duty = flyRoster->pairing->getFirstDuty();
		long callinSBY_FDPMins = flyRoster->callinSBY_FDPMins;
		if (!CalculateDuty(standbyRoster->duty, standbyRoster->qualifier, duty, callinSBY_FDPMins, base, ruleParam)) {
			break;
		}
	}
}

bool CalculateMaxFdpForStandbyRule::CalculateDuty(const string& standbyAssignmentGroup, const string& standbyAssignment, Duty* duty, const long callinSBY_FDPMins, const std::string& base, const MaxFdpForStandbyRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(standbyAssignmentGroup, standbyAssignment, *duty, base)) {
		if (!ruleParam.ignoreMaxCalloutFDP()) {
			int newMaxFDP = ruleParam._maxFDPMinutes;
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
		}

		if (!ruleParam.ignoreExtendMaxFDPByStandby()) {
			int maxFDP = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			int newMaxFDP = callinSBY_FDPMins + maxFDP;
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
		}
		next = false;
	}
	return next;
}

void CalculateMaxFdpForStandbyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFdpForStandbyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFdpForStandbyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}