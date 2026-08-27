/**
 * @file MaxFDPByCalloutStandbyForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-19
**/

#include <algorithm>
#include "../RuleSytem.h"
#include "CalculateMaxFDPByCalloutStandbyForPRRule.h"
#include "../utils/TimeUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"

void CalculateMaxFDPByCalloutStandbyForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	if (rosters.empty()) {
		return;
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	int delta = 0;
	if (_dbData->scenario.airline == "5J")
	{
		delta = 60; //5J航司抓飞差值60秒
	}
	std::map<const ROSTER*, const ROSTER*> rosterMap = RosterUtils::GetRosterMapForCalloutStandby(rosters, *RuleParams::GetInstancePtr()->getStandbyAssignments(), delta);
	for (auto& pair : rosterMap) {
		CalculateDuty(pair.first, pair.second, crew, checkedStartTime, checkedEndTime, base);
	}
}

void CalculateMaxFDPByCalloutStandbyForPRRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const std::string& base) {
	for (const auto & ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		Duty* duty = flyRoster->pairing->getFirstDuty();
		if (!CalculateDuty(standbyRoster, flyRoster, duty, ruleParam)) {
			break;
		}
	}
}

bool CalculateMaxFDPByCalloutStandbyForPRRule::CalculateDuty(const ROSTER* standbyRoster, const ROSTER* flyRoster, Duty* duty, const MaxFDPByCalloutStandbyForPRRuleParam& ruleParam) {
	bool next = true;
	
	if (ruleParam.MatchParam(standbyRoster, flyRoster, *duty)) {
		int maxFDP = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);

		bool isCallout = false;//判断是否抓飞
		int gap = static_cast<long>(flyRoster->actStrUtc - standbyRoster->actRestStrUtc);
		if (gap < 5 * 60) //gap小于5分钟（包含重叠,gap小于0），认为存在抓飞
		{
			isCallout = true;
		}

		if (isCallout) {
			int deductionMinutes = ruleParam.CalculateStandbyDeduction(standbyRoster, flyRoster);
			if (deductionMinutes > 0) {
				int newMaxFDP = maxFDP - deductionMinutes;
				if (newMaxFDP > 0) {
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFDP, ruleParam.GetId(), ruleParam.GetRuleParamId(), ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
					const_cast<ROSTER*>(flyRoster)->dutyValues.setDeductionMaxFdp(0, deductionMinutes);
				}
				else {
					Logger::getRuleLogger()->error("[ERROR] Adjuest Max FDP by callout standby failed. ruleId={}, newMaxFDP={}, pairingId={}, dutyId={}",
						ruleParam.GetId(), newMaxFDP, duty->getPairingId(), duty->getDutyId());
				}
			}
		}
		next = false;
	}
	return next;
}

void CalculateMaxFDPByCalloutStandbyForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFDPByCalloutStandbyForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFDPByCalloutStandbyForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}