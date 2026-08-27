/**
 * @file CheckSchMinRestAfterCumulativeFTForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckSchMinRestAfterCumulativeFTForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckSchMinRestAfterCumulativeFTForEvaFdRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	return CheckRule(pairing->getDutyVec());
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	return CheckRule(duties);
}

bool CheckSchMinRestAfterCumulativeFTForEvaFdRule::CheckRule(const vector<Duty*> duties) const {
	bool valid = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties[i];
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
		int minRest = -1;//最新计算出minRest
		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			//可能存在多条规则，因此同一个duty，可能计算出多个不同minrest，取其中最大值
			GetMinRestForDutyPrevious(minRest, i, 0, duties, ruleParam);
			GetMinRestForDutyAfter(minRest, i, 0, duties, ruleParam);

			GetMinRestForDutyPrevious(minRest, i, currDuty->getSegments().size() - 1, duties, ruleParam);
			GetMinRestForDutyAfter(minRest, i, currDuty->getSegments().size() - 1, duties, ruleParam);

			_ruleViolation.SetParam("consecutiveHours", ruleParam._strMinRest);
			_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
			if (minRest >= 0 && !ruleParam.CheckRule(currDuty, nextDuty, minRest)) {
				valid = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}

	}
	return valid;
}

void CheckSchMinRestAfterCumulativeFTForEvaFdRule::GetMinRestForDutyPrevious(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) const {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
	time_t windowsEndTimeUtc = currSegment->getEndTimeUtcSch();
	time_t windowStartTimeUtc = windowsEndTimeUtc - static_cast<time_t>(ruleParam._consecutiveHoursMinutes) * 60;

	int _cumulativeFTMinutes = 0;
	bool existSchFleet = false;//是否存在按计划时间检查的机型
	bool dutyBreak = false;
	for (int i = (int)currDutyIndex; i >= 0; i--) {
		Duty* prevDuty = allDuties[i];

		if (!ruleParam.MatchRule(*prevDuty)) {
			continue;
		}
		vector<Segment*> segments = prevDuty->getSegments();
		for (vector<Segment*>::reverse_iterator segIter = segments.rbegin(); segIter != segments.rend(); ++segIter) {

			if ((*segIter)->isOverlapWithUtcSch(windowStartTimeUtc, windowsEndTimeUtc)) {
				int blh = SegmentUtils::GetSchBlkMinutesWithTruncation(*(*segIter), windowStartTimeUtc, windowsEndTimeUtc, this->GetDataContext());
				if (SchDutyUtils::existFleets((*segIter))) {
					existSchFleet = true;
				}
				_cumulativeFTMinutes += blh;
				if (existSchFleet && _cumulativeFTMinutes >= ruleParam._cumulativeMaxFTMinutes) {
					if (ruleParam._minRestMinutes > minRest) {
						minRest = ruleParam._minRestMinutes;
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

void CheckSchMinRestAfterCumulativeFTForEvaFdRule::GetMinRestForDutyAfter(int& minRest, std::size_t currDutyIndex, std::size_t currDutySegmentIndex, const vector<Duty*>& allDuties, const CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam& ruleParam) const {

	Duty* currDuty = allDuties[currDutyIndex];
	Segment* currSegment = currDuty->getSegment(currDutySegmentIndex);
	time_t windowsEndTimeUtc = currSegment->getEndTimeUtcSch();
	time_t windowStartTimeUtc = windowsEndTimeUtc - static_cast<time_t>(ruleParam._consecutiveHoursMinutes) * 60;

	int _cumulativeFTMinutes = 0;
	bool existSchFleet = false;//是否存在按计划时间检查的机型
	bool dutyBreak = false;
	for (std::size_t i = currDutyIndex; i < allDuties.size(); i++) {
		Duty* nextDuty = allDuties[i];

		if (!ruleParam.MatchRule(*nextDuty)) {
			continue;
		}
		vector<Segment*> segments = nextDuty->getSegments();
		for (vector<Segment*>::iterator segIter = segments.begin(); segIter != segments.end(); ++segIter) {

			if ((*segIter)->isOverlapWithUtcSch(windowStartTimeUtc, windowsEndTimeUtc)) {
				if (SchDutyUtils::existFleets((*segIter))) {
					existSchFleet = true;
				}

				int blh = SegmentUtils::GetSchBlkMinutesWithTruncation(*(*segIter), windowStartTimeUtc, windowsEndTimeUtc, this->GetDataContext());
				_cumulativeFTMinutes += blh;

				if (existSchFleet && _cumulativeFTMinutes >= ruleParam._cumulativeMaxFTMinutes) {
					if (ruleParam._minRestMinutes > minRest) {
						minRest = ruleParam._minRestMinutes;
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

void CheckSchMinRestAfterCumulativeFTForEvaFdRule::ThrowRuleViolation(const Duty* duty) const {
	string minRest = _ruleViolation.GetParam("minRest");
	string scheduleRest = _ruleViolation.GetParam("scheduleRest");
	string consecutiveHours = _ruleViolation.GetParam("consecutiveHours");
	string schRestStartTimeUtc = _ruleViolation.GetParam("schRestStartTimeUtc");
	string schRestEndTimeUtc = _ruleViolation.GetParam("schRestEndTimeUtc");

	//在连续n小时后计划休息时长小于最小休息时长
	std::string msg = "The schedule rest period ({0:scheduleRest}) in consecutive {1:consecutiveHours} hours is less than the minimum required rest ({2:minrest}).";
	msg = StringUtils::Format(msg, scheduleRest, consecutiveHours, minRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckSchMinRestAfterCumulativeFTForEvaFdRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = (time_t)StringUtils::stoll(schRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(schRestEndTimeUtc, 0);
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	rv->operation_result.insert(pair<string, string>("scheduleRest", scheduleRest));
	rv->operation_result.insert(pair<string, string>("schRestStartTimeUtc", schRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("schRestEndTimeUtc", schRestEndTimeUtc));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckSchMinRestAfterCumulativeFTForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckSchMinRestAfterCumulativeFTForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}