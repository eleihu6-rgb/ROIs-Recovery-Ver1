/**
 * @file CheckDisruptiveScheduleRERRPForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckDisruptiveScheduleRERRPForTGRule.h"
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

bool CheckDisruptiveScheduleRERRPForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	//const auto& duties = DutyUtils::GetDuties(rosters, this->_dbData);

	//if (duties.empty() || duties.size() == 1)
	//	return true;

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	const auto& zoneId = this->_dbData->airportCodeMap[base]->zoneId;

	const auto& crewRerrpList = crew->rerrpList;

	if (crewRerrpList.empty() || crewRerrpList.size() == 1)
		return true;

	for (const auto& _ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crew->idCrew);
		for (size_t j = 0; j < crewRerrpList.size() - 1; j++) {
			const auto& currentRerrp = crewRerrpList[j];
			const auto& nextRerrp = crewRerrpList[j + 1];
			int dutyCount = 0;

			for (size_t i = 0; i < rosters.size(); i++) {
				const auto& currentRoster = rosters[i];

				if (currentRoster->pairing) {
					for (const auto& currentDuty : currentRoster->pairing->getDutyVec()) {
						if (!TimeUtils::IsAbsoluteTimesInRange(currentDuty->getStartTimeLocAct(), currentDuty->getEndTimeLocAct(), currentRerrp->endTimeLoc, nextRerrp->startTimeLoc))
							continue;

						int ref = DutyUtils::GetTimeZoneOffset(*currentDuty, this->_dbData);

						if (_ruleParam.MatchAssignments(currentDuty->getAssignment()) && _ruleParam.MatchDutyTypes(currentDuty->getStartTimeUtcAct(), currentDuty->getEndTimeUtcAct(), ref))
							dutyCount++;
					}
				}
				else {
					if (!TimeUtils::IsAbsoluteTimesInRange(currentRoster->getStartTimeLocAct(), currentRoster->getEndTimeLocAct(), currentRerrp->endTimeLoc, nextRerrp->startTimeLoc))
						continue;

					int ref = RosterUtils::GetTimeZoneOffset(currentRoster->getStartTimeLocAct(), base, this->_dbData);

					if (_ruleParam.MatchAssignments(currentRoster->qualifier) && _ruleParam.MatchDutyTypes(currentRoster->getStartTimeUtcAct(), currentRoster->getEndTimeUtcAct(), ref))
						dutyCount++;
				}

				
			}

			if (_ruleParam.MatchDutyNumberRange(dutyCount)) {
				const auto& nextRerrpLength = nextRerrp->endTimeLoc - nextRerrp->startTimeLoc;
				if (nextRerrpLength < _ruleParam._nextRERRPMinRest * 60) {
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					_ruleViolation.SetParam("minRest", numberToTimeHHMM(_ruleParam._nextRERRPMinRest));
					_ruleViolation.SetParam("start", utcToUtcString(TimezoneUtils::GetUTCTime(nextRerrp->startTimeLoc, zoneId)));
					_ruleViolation.SetParam("end", utcToUtcString(TimezoneUtils::GetUTCTime(nextRerrp->endTimeLoc, zoneId)));
					ThrowRuleViolation();
				}
			}
		}

		
	}

	return passAllRule;

}

void CheckDisruptiveScheduleRERRPForTGRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const auto& minRest = _ruleViolation.GetParam("minRest");
	string msgViolation = "The minimum recovery rest is {0:minRest}.";
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msgViolation;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckDisruptiveScheduleRERRPForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckDisruptiveScheduleRERRPForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
