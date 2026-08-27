/**
 * @file MaxFlightDutyBySplitDutyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "CalculateMaxFlightDutyBySplitDutyRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "../constant/Constants.h"

void CalculateMaxFlightDutyBySplitDutyRule::CalculateDuty(Duty *duty) {
    {
        std::lock_guard <std::mutex> lockGuard(_6020mutex);
        duty->getDutyDelta().remove(CalculateMaxFlightDutyBySplitDutyRule::RuleFuncId);
    }
	int lastMaxFDP = INT_MAX;//最新计算出MaxFDP
	for (int i = 0; i < (int)(duty->getNumSegments()) - 1; i++) {
		Segment* currSegment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		long_transit* transit = RuleParams::GetInstancePtr()->getTransit(currSegment, nextSegment);
		if (transit == nullptr) {
			continue;
		}
		// 6020 does not filter on long transit(LT) condition, without LT, FDP extension can still apply
        for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(lastMaxFDP, duty, currSegment, nextSegment, transit, ruleParam)) {
				break;
			}
		}
	}
}

void CalculateMaxFlightDutyBySplitDutyRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	for (std::size_t i = 0; i < pairing->getNumDuties(); i++) {
		Duty* duty = pairing->getDuty(i);
		if (!RuleParams::GetInstancePtr()->isTransit(duty)) {
			continue;
		}
		CalculateDuty(duty);
	}
}

bool CalculateMaxFlightDutyBySplitDutyRule::CalculateDuty(int& lastMaxFDP, Duty *duty, const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const MaxFlightDutyBySplitDutyRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(currSegment, nextSegment, longTransit, duty)) {
		if (ruleParam._maxIncreaseInFDP == RuleParamConstant::ALL && ruleParam._maxFDP == RuleParamConstant::ALL)
			return true;
		int increaseFDP = GetIncreaseFDP(currSegment, nextSegment, longTransit, duty, ruleParam);
		int maxFDP = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
		int newMaxFDP = increaseFDP + maxFDP;
		if (newMaxFDP < lastMaxFDP) {
			lastMaxFDP = newMaxFDP;
			duty->setDeltaFDPAfterRest(ruleParam._deltaFDPMinutesAfterRest);
			{
				std::lock_guard <std::mutex> lockGuard(_6020mutex);
				duty->getDutyDelta().addFDPMinutes(CalculateMaxFlightDutyBySplitDutyRule::RuleFuncId, increaseFDP);
			}
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, newMaxFDP, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
		}
	}
	return next;
}

int CalculateMaxFlightDutyBySplitDutyRule::GetIncreaseFDP(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam)  {
	int currentFDPLimitation = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	int increaseInFDPMinutes = 0; //增加FDP时长（分钟数）
	if (ruleParam._increaseInFDP == RuleParamConstant::ALL) {
		int restDuration = SegmentUtils::GetActualRestMinutes(currSegment, nextSegment, longTransit);
		increaseInFDPMinutes = std::min((int)(ruleParam._percentIncreaseInFDP * restDuration), ruleParam._maxIncreaseInFDPMinutes);
	}
	else {
		increaseInFDPMinutes = ruleParam._increaseInFDPMinutes;
	}

	if (currentFDPLimitation + increaseInFDPMinutes >= ruleParam._maxFDPMinutes) {
		//实际FDP与增加FDP值大于最大值，则调整到增加值
		increaseInFDPMinutes = ruleParam._maxFDPMinutes - currentFDPLimitation;
	}
	return increaseInFDPMinutes;
}

void CalculateMaxFlightDutyBySplitDutyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyBySplitDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MaxFlightDutyBySplitDutyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}