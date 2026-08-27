/**
 * @file CalculateMinRestAfterCumulativeFTForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CalculateMinRestAfterCumulativeFTForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestAfterCumulativeFTForEvaFdRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMinRestAfterCumulativeFTForEvaFdRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

void CalculateMinRestAfterCumulativeFTForEvaFdRule::CalculateDuty(vector<Duty*> duties) {
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties[i];
		int minRest = -1;//最新计算出minRest
		for (const auto& ruleParam : _ruleParams) {

			//可能存在多条规则，因此同一个duty，可能计算出多个不同minrest，取其中最大值
			CalculateDutyPrevious(minRest, i, 0, duties, ruleParam);
			CalculateDutyAfter(minRest, i, 0, duties, ruleParam);

			CalculateDutyPrevious(minRest, i, currDuty->getSegments().size() - 1, duties, ruleParam);
			CalculateDutyAfter(minRest, i, currDuty->getSegments().size() - 1, duties, ruleParam);
		}
	}
}


void CalculateMinRestAfterCumulativeFTForEvaFdRule::CalculateDutyPrevious(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CalculateMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
	time_t windowsEndTimeUtc = currSegment->getEndTimeUtcAct();
	time_t windowStartTimeUtc = windowsEndTimeUtc - static_cast<time_t>(ruleParam._consecutiveHoursMinutes) * 60;

	int _cumulativeFTMinutes = 0;

	bool dutyBreak = false;
	for (int i = (int)currDutyIndex; i >= 0; i--) {
		Duty* prevDuty = allDuties[i];

		if (!ruleParam.MatchRule(*prevDuty)) {
			continue;
		}
		vector<Segment*> segments = prevDuty->getSegments();
		for (vector<Segment*>::reverse_iterator segIter = segments.rbegin(); segIter != segments.rend(); ++segIter) {

			if ((*segIter)->isOverlapWithUtcAct(windowStartTimeUtc, windowsEndTimeUtc)) {

				int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartTimeUtc, windowsEndTimeUtc, this->GetDataContext());
				_cumulativeFTMinutes += blh;
				if (_cumulativeFTMinutes >= ruleParam._cumulativeMaxFTMinutes) {
					if (ruleParam._minRestMinutes > minRest) {
						minRest = ruleParam._minRestMinutes;
						currDuty->setMinRest(ruleParam._minRestMinutes, true);
						currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._minRestMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
					}

					dutyBreak = true;
					break;
				}

			}
		}
		if (dutyBreak) {
			break;
		}
	}

}

void CalculateMinRestAfterCumulativeFTForEvaFdRule::CalculateDutyAfter(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CalculateMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
	time_t windowsEndTimeUtc = currSegment->getEndTimeUtcAct();
	time_t windowStartTimeUtc = windowsEndTimeUtc - static_cast<time_t>(ruleParam._consecutiveHoursMinutes) * 60;

	int _cumulativeFTMinutes = 0;

	bool dutyBreak = false;
	for (std::size_t i = currDutyIndex; i < allDuties.size(); i++) {
		Duty* nextDuty = allDuties[i];

		if (!ruleParam.MatchRule(*nextDuty)) {
			continue;
		}
		vector<Segment*> segments = nextDuty->getSegments();
		for (vector<Segment*>::iterator segIter = segments.begin(); segIter != segments.end(); ++segIter) {

			if ((*segIter)->isOverlapWithUtcAct(windowStartTimeUtc, windowsEndTimeUtc)) {

				int blh = SegmentUtils::GetBlkMinutesWithTruncation(*(*segIter), windowStartTimeUtc, windowsEndTimeUtc, this->GetDataContext());
				_cumulativeFTMinutes += blh;
				if (_cumulativeFTMinutes >= ruleParam._cumulativeMaxFTMinutes) {
					if (ruleParam._minRestMinutes > minRest) {
						minRest = ruleParam._minRestMinutes;
						currDuty->setMinRest(ruleParam._minRestMinutes, true);
						currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, ruleParam._minRestMinutes, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference(), true);
					}
					dutyBreak = true;
					break;
				}

			}
		}
		if (dutyBreak) {
			break;
		}
	}

}

void CalculateMinRestAfterCumulativeFTForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestAfterCumulativeFTForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CalculateMinRestAfterCumulativeFTForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}