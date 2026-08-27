/**
 * @file CheckMaxFlightsInPeriodForPRRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxFlightsInPeriodForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/SegmentUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool CheckMaxFlightsInPeriodForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;
	const auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	const auto& crewId = rosters[0]->idcrew;
	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);
		_ruleViolation.SetParam("period", to_string(_ruleParam._period));
		_ruleViolation.SetParam("unit", _ruleParam._unit);
		_ruleViolation.SetParam("maxNumber", to_string(_ruleParam._maxFlights));
		vector<Segment*> segmentsFilter;
		for (const auto& roster : rosters) {
			if (!roster->pairing)
				continue;

			const auto& segments = roster->pairing->getSegmentsRead();

			//收集符合条件的flight
			for (const auto& segment : segments) {
				if (_ruleParam.MatchAssignment(segment->getAssignment())) {
					segmentsFilter.push_back(segment);
				}
			}

		}

		for (const auto& segment : segmentsFilter) {
			time_t checkStart = segment->getStartTimeLocAct();
			time_t checkStartUtc = segment->getStartTimeUtcAct();
			string airport = segment->getDepStation();
			if (_ruleParam._type == "E") {
				checkStart = segment->getEndTimeLocAct();
				checkStartUtc = segment->getEndTimeUtcAct();
				airport = segment->getArrStation();
			}
			time_t checkEnd = checkStart;
			time_t checkEndUtc = checkStartUtc;
			if (_ruleParam._unit == "RH") {
				checkEnd = checkStart + _ruleParam._period * 3600;
				checkEndUtc = checkStartUtc + _ruleParam._period * 3600;
			}
			else if (_ruleParam._unit == "CD") {
				checkStart = TimeUtils::GetStartTimeOfDay(checkStart);
				const auto& zoneId = this->_dbData->airportZoneIdMap[base];
				checkStartUtc = TimezoneUtils::GetUTCTime(checkStart, zoneId);
				checkEnd = checkStart + _ruleParam._period * (24 * 3600);
				checkEndUtc = checkStartUtc + _ruleParam._period * (24 * 3600);
			}
			
			const auto& number = SegmentUtils::GetSegmentNumberInRangeByStartOrEnd(segmentsFilter, checkStart, checkEnd, _ruleParam._type);

			if (number > _ruleParam._maxFlights) {
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("start", to_string(checkStartUtc));
				_ruleViolation.SetParam("end", to_string(checkEndUtc));
				_ruleViolation.SetParam("actNumber", to_string(number));
				_ruleViolation.SetParam("checkStart", utcToUtcString(checkStart));
				_ruleViolation.SetParam("checkEnd", utcToUtcString(checkEnd));
				ThrowRuleViolation();
			}
		}
	}

	return passAllRule;

}

void CheckMaxFlightsInPeriodForPRRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const auto& actNumber = _ruleViolation.GetParam("actNumber");
	const auto& maxNumber = _ruleViolation.GetParam("maxNumber");
	const auto& period = _ruleViolation.GetParam("period");
	const auto& unit = _ruleViolation.GetParam("unit");
	const auto& startTime = _ruleViolation.GetParam("checkStart");
	const auto& endTime = _ruleViolation.GetParam("checkEnd");
	string msg = "The actual number of roster flights({0:actNumber}) is more than the limitation ({1:maxNumber}) in Period Unit({2:period} {3:unit}) from {4:startTime} - {5:endTime}.";
	msg = StringUtils::Format(msg, actNumber, maxNumber, period, unit, startTime, endTime);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxFlightsInPeriodForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxFlightsInPeriodForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
