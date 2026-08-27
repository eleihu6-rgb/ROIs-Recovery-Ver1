/**
 * @file CheckMaxEarlyStartOrLateFinishWithinPeriodRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxEarlyStartOrLateFinishWithinPeriodRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckMaxEarlyStartOrLateFinishWithinPeriodRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	vector<SharedPtr<DBRule_8014>>& asnGroup = this->_dbData->rule_8014;
	const auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];

	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.ClearParam();
		_ruleViolation.SetParam("crewid", crew->idCrew);
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("maxLimit", to_string(ruleParam._maxLimits));
		_ruleViolation.SetParam("minLimit", to_string(ruleParam._minLimits));
		_ruleViolation.SetParam("period", to_string(ruleParam._period));
		_ruleViolation.SetParam("unit", ruleParam._unit);
		const auto& rUnit = ruleParam._unit;
		const auto& period = ruleParam._period;
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		map<time_t, time_t> mp;
		if (rUnit == "CM")
		{
			mp = Utility::GetInstancePtr()->getMonthRollingWindows(checkedStartTime, checkedEndTime + 24 * 3600, offsetMinutes, period);
		}
		else if (rUnit == "CW")
		{
			mp = Utility::GetInstancePtr()->getWeeksRollingWindows(checkedStartTime - (period * 7 - 1) * 24 * 3600, checkedEndTime + (period * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, period);
		}
		else if (rUnit == "CD")
		{
			mp = Utility::GetInstancePtr()->getDaysRollingWindows(checkedStartTime - (period - 1) * 24 * 3600, checkedEndTime + (period - 1) * 24 * 3600, offsetMinutes, period);
		}
		else {
			continue;
		}
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
			_ruleViolation.SetParam("start", to_string(mp_it->first));
			_ruleViolation.SetParam("end", to_string(mp_it->second));
			int count = 0;
			for (size_t i = 0; i < rosters.size(); i++) {
				if (!rosters[i]->pairing)
					continue;

				const auto& duties = rosters[i]->pairing->getDutyVec();
				if (ruleParam._checkMode == "P") {
					if (!ruleParam.MatchAssignmentParam(rosters[i]->pairing->getQualifier()))
						continue;
					if (!TimeUtils::IsAbsoluteTimesCovered(rosters[i]->pairing->getStartTimeLocAct(), rosters[i]->pairing->getEndTimeLocAct(), mp_it->first, mp_it->second))
						continue;
					if (ruleParam._checkType.find("Early Start") != string::npos) {
						count += DutyUtils::IsEarlyStartDuty(rosters[i]->pairing->getStartTimeLocAct(), 0) ? 1 : 0;
					}
					if (ruleParam._checkType.find("Late Finish") != string::npos) {
						count += DutyUtils::IsLateFinishTime(rosters[i]->pairing->getEndTimeLocAct(), 0) ? 1 : 0;
					}
					if (ruleParam._checkType.find("WOCL") != string::npos) {
						count += DutyUtils::IsWoclTime(rosters[i]->pairing->getStartTimeLocAct(), rosters[i]->pairing->getEndTimeLocAct(), 0) ? 1 : 0;
					}
				}
				else if (ruleParam._checkMode == "D") {
					for (const auto& duty : duties) {
						if (!ruleParam.MatchAssignmentParam(duty->getAssignment()))
							continue;
						if (!TimeUtils::IsAbsoluteTimesCovered(duty->getStartTimeLocAct(), duty->getEndTimeLocAct(), mp_it->first, mp_it->second))
							continue;
						if (ruleParam._checkType.find("Early Start") != string::npos) {
							count += DutyUtils::IsEarlyStartDuty(duty->getStartTimeLocAct(), 0) ? 1 : 0;
						}
						if (ruleParam._checkType.find("Late Finish") != string::npos) {
							count += DutyUtils::IsLateFinishTime(duty->getEndTimeLocAct(), 0) ? 1 : 0;
						}
						if (ruleParam._checkType.find("WOCL") != string::npos) {
							count += DutyUtils::IsWoclTime(duty->getStartTimeLocAct(), duty->getEndTimeLocAct(), 0) ? 1 : 0;
						}
					}
				}
				else {
					/*if (rosters[i]->actEndLoc < mp_it->first || rosters[i]->actStrLoc > mp_it->second)
						continue;*/
					for (size_t j = 0; j < duties.size(); j++) {
						const auto& segments = duties[j]->getSegments();
						for (size_t z = 0; z < segments.size(); z++) {
							if (segments[z]->getEndTimeLocAct() < mp_it->first || segments[z]->getStartTimeLocAct() > mp_it->second)
								continue;
							if (!ruleParam.MatchAssignmentParam(segments[z]->getAssignment()))
								continue;
							if (ruleParam._checkType.find("Early Start") != string::npos) {
								count += DutyUtils::IsEarlyStartDuty(segments[z]->getStartTimeLocAct(), 0) ? 1 : 0;
							}
							if (ruleParam._checkType.find("Late Finish") != string::npos) {
								count += DutyUtils::IsLateFinishTime(segments[z]->getEndTimeLocAct(), 0) ? 1 : 0;
							}
							if (ruleParam._checkType.find("WOCL") != string::npos) {
								count += DutyUtils::IsWoclTime(segments[z]->getStartTimeLocAct(), segments[z]->getEndTimeLocAct(), 0) ? 1 : 0;
							}
						}
					}
				}
				
			}
			if (count > ruleParam._maxLimits || count < ruleParam._minLimits) {
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("count", to_string(count));
				_ruleViolation.SetParam("maxLimit", to_string(ruleParam._maxLimits));
				_ruleViolation.SetParam("minLimit", to_string(ruleParam._minLimits));
				_ruleViolation.SetParam("checkType", ruleParam._checkType);
				ThrowRuleViolation();
				passAllRule = false;
			}
		}
	}
	return passAllRule;
}

void CheckMaxEarlyStartOrLateFinishWithinPeriodRule::ThrowRuleViolation() const {
	const auto& crewid = _ruleViolation.GetParam("crewid");
	string count = _ruleViolation.GetParam("count");
	string maxLimit = _ruleViolation.GetParam("maxLimit");
	string minLimit = _ruleViolation.GetParam("minLimit");
	string period = _ruleViolation.GetParam("period");
	string unit = _ruleViolation.GetParam("unit");
	string checkType = _ruleViolation.GetParam("checkType");

	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	std::string msg = "The {0:checkType} flight number is {1:count} exceed the maximum limit {2:maxLimit} or less than the minimum limit {3:minLimit} in {4:period} {5:unit}.";
	msg = StringUtils::Format(msg, checkType, count, maxLimit, minLimit, period, unit);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = crewid;
	//rv->dutySequenceNumber = (*duty_iter)->getDutySegNum();
	//rv->segmentId = (*seg_iter)->getDBId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	//OP#1448提供message参数给gantt

	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxEarlyStartOrLateFinishWithinPeriodRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
