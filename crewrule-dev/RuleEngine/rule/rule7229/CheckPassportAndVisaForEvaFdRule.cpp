/**
 * @file CheckPasswordAndVisaForEvaFdRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckPassportAndVisaForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"


bool CheckPassportAndVisaForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

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
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		const auto& crewNationality = crew->nationality;
		if (ruleParam._nationalities.size() > 0 && ruleParam._nationalities[0] != "*" && find(ruleParam._nationalities.begin(), ruleParam._nationalities.end(), crewNationality) == ruleParam._nationalities.end())
			continue;
		if (ruleParam._exceptNationalities.size() > 0 && ruleParam._exceptNationalities[0] != "*" && find(ruleParam._exceptNationalities.begin(), ruleParam._exceptNationalities.end(), crewNationality) != ruleParam._exceptNationalities.end())
			continue;
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("rosterCode", ruleParam._dayAssignmentCode);
		time_t gapStartTime = 0;
		time_t gapEndTime = 0;
		vector<string> quals;
		quals.emplace_back(ruleParam._qualification);		
		for (const auto& roster : rosters) {

			if (ruleParam.MatchAssignmentCode(roster)) {
				gapStartTime = TimeUtils::GetStartTimeOfDay(roster->actRestStrLoc) + 3600 * 24;
				gapEndTime = GetEndDayByHolidayOrWeekend(gapStartTime, ruleParam._gapDays, ruleParam._gapDaysWithoutHoliday, ruleParam._holidayCountries);
			}
			if (gapStartTime != 0 && gapEndTime != 0 && roster->actStrLoc > gapEndTime)
				continue;

			//安排特定训练任务时，对应资质是否已过期。false表示未过期，true表示过期
			bool isQualExpired = !RosterUtils::IsValidCrewQualification(roster, crew, quals);

			if (!roster->pairing) {
				if (!ruleParam.MatchAssignmentParam(roster->qualifier) && gapStartTime != 0 && gapEndTime != 0 && (ruleParam._isQualExpired == nullptr || ruleParam.MatchQualExpiredParam(isQualExpired)) ) {
					if (this->_application == ROSTER_OPTIMIZER)
						return false;
					ThrowRuleViolation(roster);
					passAllRule = false;
				}
				continue;
			}
			const auto& matchLayover = ruleParam.MatchLayoverParam(roster->pairing);
			const auto& layoverAllowed = ruleParam._onlyCheckLayover == "N" || (ruleParam._onlyCheckLayover == "Y" && !matchLayover);
			if (!matchLayover && gapStartTime != 0 && gapEndTime != 0 && (ruleParam._isQualExpired == nullptr || ruleParam.MatchQualExpiredParam(isQualExpired)) ) {
				if (this->_application == ROSTER_OPTIMIZER) {
					if (roster->source == "PA")
						continue;
					return false;

				}
				ThrowRuleViolation(roster);
				passAllRule = false;
				continue;
			}
			for (const auto& seg : roster->pairing->getSegments()) {
				const auto & rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), crew->idCrew);
				
				if (rf == nullptr) {
					Logger::getRuleLogger()->error("ERROR: Cannot find the rosterFlight, flightId={}, crewId={}", seg->getDBId(), crew->idCrew);
					continue;
				}
				const auto& allowedAssignment = ruleParam.MatchAssignmentParam(rf->assignment);
				if (!ruleParam.MatchSegmentParam(seg) && gapStartTime != 0 && gapEndTime != 0 && layoverAllowed && !allowedAssignment && (ruleParam._isQualExpired == nullptr || ruleParam.MatchQualExpiredParam(isQualExpired))) {
					if (this->_application == ROSTER_OPTIMIZER) {
						if (roster->source == "PA")
							continue;
						return false;
					}
					ThrowRuleViolation(roster);
					passAllRule = false;
					continue;
				}
				
			}
		}

	}
	return passAllRule;
}

void CheckPassportAndVisaForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckPassportAndVisaForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckPassportAndVisaForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}


void CheckPassportAndVisaForEvaFdRule::ThrowRuleViolation(const ROSTER* roster) const {

	const auto& rosterCode = this->_ruleViolation.GetParam("rosterCode");
	std::string msg = "Cannot take flight or layover after {0:rosterCode} scheduled when expired";
	msg = StringUtils::Format(msg, rosterCode);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	

	rv->pairingId = roster->pairId;
	rv->crewId = roster->idcrew;
	rv->rosterId = roster->rosterId;
	rv->startDTUtc = roster->actStrUtc;
	rv->endDTUtc = roster->actEndUtc;

	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}

time_t CheckPassportAndVisaForEvaFdRule::GetEndDayByHolidayOrWeekend(const time_t startDay, const int days, const bool isWithoutHolidayAndWeekend, const std::vector<std::string> holidayCountries) const {
	time_t endDay;
	if (!isWithoutHolidayAndWeekend || days <= 0) {
		endDay = startDay + days * 24 * 3600;
	}
	else {
		endDay = startDay;
		int workDays = days;
		while (workDays > 0)
		{
			if (!isWeekend(endDay) && !isHoliday(endDay, holidayCountries)) {
				workDays--;
			}
			endDay += 3600 * 24;
		}
	}
	return endDay;
	
}

bool CheckPassportAndVisaForEvaFdRule::isWeekend(const time_t time) const {
	const auto& day = TimeUtils::GetDayOfWeekend(time);
	return day >= 5;
}

bool CheckPassportAndVisaForEvaFdRule::isHoliday(const time_t time, const std::vector<std::string> holidayContries) const {
	for (const auto& holiday : this->_dbData->holidays) {
		if (find(holidayContries.begin(), holidayContries.end(), holiday->country) != holidayContries.end()) {
			if (time >= holiday->strDt && time <= holiday->endDt) {
				return true;
			}
		}
	}
	return false;
}