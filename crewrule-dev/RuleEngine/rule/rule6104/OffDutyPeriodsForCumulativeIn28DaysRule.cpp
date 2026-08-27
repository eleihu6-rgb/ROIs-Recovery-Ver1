/**
 * @file OffDutyPeriodsForCumulativeIn28DaysRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "OffDutyPeriodsForCumulativeIn28DaysRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"

bool OffDutyPeriodsForCumulativeIn28DaysRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (const auto & ruleParam : _ruleParams) {
		bool valid = CheckRule(pairing, ruleParam);
		if (!valid) {
			passAllRule = false;
			break;
		}
	}
	return passAllRule;
}
bool OffDutyPeriodsForCumulativeIn28DaysRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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
	for (const auto & ruleParam : _ruleParams) {
		for (auto roster : rosters) {
			std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[roster->idcrew];
			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				break;
			}
			Pairing* pairing = nullptr;
			if (roster->pairId != 0 && _dbData->pairingIdMap.find(roster->pairId) != _dbData->pairingIdMap.end()) {
				pairing = _dbData->pairingIdMap[roster->pairId];
			}
			if (pairing == nullptr) {
				//TODO 地面任务如何处理？？？？ by hexd
				return true;
			}
			bool valid = CheckRule(pairing, ruleParam);
			if (!valid) {
				passAllRule = false;
				break;
			}
		}
	}
	return passAllRule;
}

bool OffDutyPeriodsForCumulativeIn28DaysRule::CheckRule(const Pairing* pairing, 
	const OffDutyPeriodsForCumulativeIn28DaysRuleParam& ruleParam) const {
	//TODO
	return false;
}

void OffDutyPeriodsForCumulativeIn28DaysRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(OffDutyPeriodsForCumulativeIn28DaysRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(OffDutyPeriodsForCumulativeIn28DaysRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}