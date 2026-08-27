#include "CalculateDutyDpInMandayRule.h"
#include <cfloat>
#include <algorithm>
#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

int CalculateDutyDpInMandayRule::Calculate(Duty *duty) {
	int dutyDp = duty->getActualDP();
	if (!duty->isSplitDuty()) {
		return dutyDp;
	}
	for (const auto & ruleParam : _ruleParams) {
		for (int i = 0; i < (int)(duty->getNumSegments()) - 1; i++) {

			Segment* currSegment = duty->getSegment(i);
			Segment* nextSegment = duty->getSegment(i + 1);
			long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(currSegment, nextSegment);
			if (longTransit == nullptr) {
				continue;
			}

			if (ruleParam.MatchParam(currSegment, nextSegment, longTransit, duty)) {
				dutyDp = std::min(dutyDp, GetMaxDP(duty->getSegment(i), duty->getSegment(i + 1), longTransit, duty, ruleParam));
				break;
			}
		}
		
	}
	return dutyDp;
}

int CalculateDutyDpInMandayRule::CalculateDuty(Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam) {
	int newDp = 0;
	for (int i = 0; i < (int)(duty->getNumSegments()) - 1; i++) {
		Segment* segment = duty->getSegment(i);
		Segment* nextSegment = duty->getSegment(i + 1);
		long_transit* longTransit = RuleParams::GetInstancePtr()->getLongTransit(segment, nextSegment);
		if (longTransit == nullptr) {
			continue;
		}
		if (ruleParam.MatchParam(segment, nextSegment, longTransit, duty)) {
			int newMaxDP = GetMaxDP(segment, nextSegment, longTransit, duty, ruleParam);
			return newMaxDP;
		}
	}
	return newDp;
}


int CalculateDutyDpInMandayRule::GetMaxDP(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam) {
	int maxDPMinutes = duty->getActualDP();
	int reduceInDPMinutes = 0; //增加FDP时长（分钟数）
	if (ruleParam._increaseInFDP == RuleParamConstant::ALL) {
		int restDuration = SegmentUtils::GetActualRestMinutes(currSegment, nextSegment, longTransit);
		reduceInDPMinutes = std::min((int)(ruleParam._percentIncreaseInFDP * restDuration), ruleParam._maxIncreaseInFDPMinutes);
		reduceInDPMinutes = reduceInDPMinutes * -1;
 	}
	else {
		reduceInDPMinutes = ruleParam._deltaFDPMinutesAfterRest;
	}
	return std::min(maxDPMinutes + reduceInDPMinutes, maxDPMinutes);
}

void CalculateDutyDpInMandayRule::ParseParam(const InputType& input) {
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