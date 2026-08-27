/**
 * @file MinOffDutyPeriodForCcRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <cfloat>
#include "../RuleSytem.h"
#include "MinOffDutyPeriodForCcRule.h"
#include "UtilFunc.h"
#include "AirportDefaultTmOffset.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"


void MinOffDutyPeriodForCcRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	if (this->IsPairingOptimizerModel()) {
		return;
	}

    // todo get duty is augment interface, use non-augment for demo
    //const int& dutyBlockTime = duty->getActualBlockTime();
	int minTimeFreeOfDuty = INT_MAX;
	const RuleParam* minRuleParam = nullptr;

	auto timeFreeOfDutys = GetTimeFreeOfDuty(duty);
	if (timeFreeOfDutys.empty()) {
		return;
	}
	//获得最小ODP
    for (const auto& rulePair : timeFreeOfDutys) {
        if (minTimeFreeOfDuty > rulePair.first) {
			minRuleParam = &(rulePair.second);
			minTimeFreeOfDuty = rulePair.first;
        }
    }

	if (duty->getMinRest() < minTimeFreeOfDuty) {
		duty->setMinRest(minTimeFreeOfDuty);
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minTimeFreeOfDuty, minRuleParam->GetId(), minRuleParam->GetRuleParamId(), minRuleParam->GetOverrideAbility(), minRuleParam->GetClassType(), minRuleParam->GetDescription(), minRuleParam->GetReference());//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
	}
}

void MinOffDutyPeriodForCcRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void MinOffDutyPeriodForCcRule::CalculateDuty(vector<Duty*> duties) {

	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty *duty = duties.at(i);

		// todo get duty is augment interface, use non-augment for demo
		//const int& dutyBlockTime = duty->getActualBlockTime();
		int minTimeFreeOfDuty = INT_MAX;
		const RuleParam* minRuleParam = nullptr;

		auto timeFreeOfDutys = GetTimeFreeOfDuty(duty);
		if (timeFreeOfDutys.empty()) {
			return;
		}
		//获得最小ODP
		for (const auto& rulePair : timeFreeOfDutys) {
			if (minTimeFreeOfDuty > rulePair.first) {
				minRuleParam = &(rulePair.second);
				minTimeFreeOfDuty = rulePair.first;
			}
		}

		if (duty->getMinRest() < minTimeFreeOfDuty) {
			duty->setMinRest(minTimeFreeOfDuty);
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minTimeFreeOfDuty, minRuleParam->GetId(), minRuleParam->GetRuleParamId(), minRuleParam->GetOverrideAbility(), minRuleParam->GetClassType(), minRuleParam->GetDescription(), minRuleParam->GetReference());//20190615 ain, mantis#5947, 确保违规信息输出 rule_id
		}
	}
}

void MinOffDutyPeriodForCcRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule: input.dbRules) {
		_ruleParams.emplace_back(MinOffDutyPeriodForCcRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString: input.ruleParamString) {
        _ruleParams.emplace_back(MinOffDutyPeriodForCcRuleParam(this));
        auto& newParam = _ruleParams.back();
        newParam.ParseParam(singleRuleParamString);
    }
}

std::vector<std::pair<int, RuleParam>> MinOffDutyPeriodForCcRule::GetTimeFreeOfDuty(const Duty *duty) const {
	std::vector<std::pair<int, RuleParam>> result;
	int prevDutyDpMinute = duty->getDPInSecs() / 60;
	
	int rest = 0;
    for (const auto & _ruleParam : _ruleParams) {
        //if(_ruleParam.MatchParam(composition, reportTime, isAugment)) {
        //    result.emplace_back(_ruleParam._maxBlockTime, _ruleParam._severity);
        //}
		int discount = 0;
		if (duty->isSplitDuty()) {
			//Split Duty which doesn’t include any period of between 2300 - 0530	
			//Discounting DP for determining the duty free of duty = min(4 hours, 50 % of split rest period)
			//Split Rest Period
//			currDuty->getSegments().begin() 开始时间和结束时间转化到 currDuty->getDepStation 时区 2300~0530
			//currDuty->getSegment()
			int maxTransitTime = INT_MIN;
			int maxSegmentStartIndex = -1;
			for (int i = 0; i < (int)duty->getNumSegments() - 1; i++) {
				Segment* segment = const_cast<Duty*>(duty)->getSegment(i);
				Segment* nextSegment = (i + 1 >= (int)duty->getNumSegments()) ? nullptr : const_cast<Duty*>(duty)->getSegment( i+1 );
				if (nextSegment != nullptr) {
					int transitTime = static_cast<int>(nextSegment->getStartTime() - segment->getEndTime());
					if (transitTime > maxTransitTime) {
						maxTransitTime = transitTime;
						maxSegmentStartIndex = i;
					}
				}
				else {
					//最后一个Segment不涉及ODP，不处理
				}
			}
			Segment* segment = const_cast<Duty*>(duty)->getSegment(maxSegmentStartIndex);
			Segment* nextSegment = const_cast<Duty*>(duty)->getSegment(maxSegmentStartIndex+1);
			time_t restStartTimeUtc = 0, restEndTimeUtc = 0;
			SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, segment, nextSegment);
			
			int offsetTZ = SegmentUtils::GetTimeZoneOffsetByArr(*segment, _dbData);
			//需要更换到 currDuty->getDepStation() 所在时区
			time_t restStartTimeLoc = restStartTimeUtc + offsetTZ * 60;
			time_t restEndTimeLoc = restEndTimeUtc + offsetTZ * 60;
			// 所在时区的 2300~0530  相交 discount = 0;
			//currDuty->getBase()
			
			if (TimeUtils::IsTimesCovered(restStartTimeLoc, restEndTimeLoc,
				_ruleParam._splitDutyLimitStartTimeMinutes, _ruleParam._splitDutyLimitEndTimeMinutes)) {
				//No discount to rest time
				discount = 0;
			}
			else {
				//Discounting DP for determining the duty free of duty = min (4 hours, 50% of split rest period)
				int splitRestPeriod = static_cast<int>(restEndTimeUtc - restStartTimeUtc) / 60;
				discount = std::min(_ruleParam._splitDutyMinRefRest,(unsigned int)( _ruleParam._splitRestPeriodDiscountFactor * splitRestPeriod));
			}
		}
		
		const int paramPrevDP = _ruleParam._prevDPMinutes;
		const int paramMaxRefRestDP = _ruleParam._maxRefRestDPMinutes;
		const double paramFactorDP = _ruleParam._factorDP;
		if (prevDutyDpMinute <= paramPrevDP) {
			//<= 12 hours 	Max(10 hours, DP of previous duty)
			rest = std::max(paramMaxRefRestDP, prevDutyDpMinute - discount);
		}
		else {
			//> 12 hours	12 hours + 1.5 * (DP of previous duty – 12 hours)
			rest = paramPrevDP + (int)(paramFactorDP * (prevDutyDpMinute - discount - paramPrevDP));
		}
		result.emplace_back(rest, _ruleParam);
    }
    // If no rule param is matched, no rules needed to be checked
    return result;
}
