/**
 * @file CheckInexperiencedCrewFor5JRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckInexperiencedCrewFor5JRule.h"
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
#include "../period/WorkPeriod.h"
#include "../period/BaseActivityPeriod.h"

bool CheckInexperiencedCrewFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crewId = rosters[0]->idcrew;
	const auto& crew = this->_dbData->crewIdMap[crewId];
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

	const auto& activities = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);

	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO)
			continue;
		if (!_ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);

		for (const auto& roster : rosters) {
			//不是地面任务
			if (roster->pairing) {
				for (const auto& segment : roster->pairing->getSegmentsRead()) {
					if (!_ruleParam.MatchAssignment(segment)) {
						continue;
					}
					if (!_ruleParam.MatchSegmentRuleParam(segment)) {
						continue;
					}

					auto iter = this->_dbData->crewOnFlt.find(segment->getDBId());
					if (iter != this->_dbData->crewOnFlt.end()) {
						int inexperiencedCrewNum = 0;
						for (const auto& cof : iter->second) {
							if (!_ruleParam.MatchAssignment(cof->assignment)) {
								continue;
							}
							if (!_ruleParam.MatchActingRanks(cof->actingRank)) {
								continue;
							}
							if (this->_dbData->crewIdMap.find(cof->crewId) != this->_dbData->crewIdMap.end()) {
								const auto& crew = this->_dbData->crewIdMap[cof->crewId];
								if (crew->crewFirstDutyInfo && crew->crewFirstDutyInfo->inexperiencedEndDate > segment->getEndTimeLocAct())
									++inexperiencedCrewNum;
							}
						}

						if (inexperiencedCrewNum > _ruleParam._maxInexperienceCrews) {
							_ruleViolation.SetParam("actNum", to_string(inexperiencedCrewNum));
							_ruleViolation.SetParam("maxNum", to_string(_ruleParam._maxInexperienceCrews));
							_ruleViolation.SetParam("rosterId", to_string(roster->rosterId));
							_ruleViolation.SetParam("start", to_string(segment->getStartTimeUtcAct()));
							_ruleViolation.SetParam("end", to_string(segment->getEndTimeUtcAct()));
							ThrowRuleViolation(segment);
						}
					}
				}
			}
			else {
				if (!_ruleParam.MatchAssignment(roster) || !_ruleParam.MatchAirportCategories(roster)) {
					continue;
				}

				if (crew->crewFirstDutyInfo && crew->crewFirstDutyInfo->inexperiencedEndDate > roster->restStrUtc) {
					if (_ruleParam._maxInexperienceCrews == 0) {
						_ruleViolation.SetParam("actNum", "1");
						_ruleViolation.SetParam("maxNum", "0");
						_ruleViolation.SetParam("start", to_string(roster->actStrUtc));
						_ruleViolation.SetParam("end", to_string(roster->actRestStrUtc));
						_ruleViolation.SetParam("rosterId", to_string(roster->rosterId));
						ThrowRuleViolation(nullptr);
						passAllRule = false;
					}
				}
			}
		}
	}

	return passAllRule;

}

void CheckInexperiencedCrewFor5JRule::ThrowRuleViolation(const Segment* segment) const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& rosterId = _ruleViolation.GetParam("rosterId");
	const auto& actNum = _ruleViolation.GetParam("actNum");
	const auto& maxNum = _ruleViolation.GetParam("maxNum");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msg = "";
	if (segment) {
		msg = "Actual inexperienced crew count ({0:actNum}) > configured threshold ({1:maxNum}) for the flight ({2:fltNum}).";
		msg = StringUtils::Format(msg, actNum, maxNum, segment->getFlightNumber());

	}
	else {
		msg = "Actual inexperienced crew count ({0:actNum}) > configured threshold ({1:maxNum}) for the ground roster.";
		msg = StringUtils::Format(msg, actNum, maxNum);

	}
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	rv->crewId = crewId;
	if (segment) {
		rv->pairingId = segment->getPairingId();
		rv->dutySequenceNumber = segment->getDutySeq();
		rv->segmentId = segment->getDBId();
	}

	rv->rosterId = stoll(rosterId);
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckInexperiencedCrewFor5JRule::ParseParam(const InputType& input) {
	//add by hexd ???DBRule???
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckInexperiencedCrewFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
