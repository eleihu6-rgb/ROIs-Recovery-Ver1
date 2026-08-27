/**
 * @file CheckMaxLayoversInTripsForMonthRule.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2024-12-04
**/


#include <algorithm>

#include "../RuleSytem.h"
#include "CheckMaxLayoversInTripsForMonthRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

bool CheckMaxLayoversInTripsForMonthRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {

	if (rosters.size() == 0)
		return true;

	time_t rollingWindow_start, rollingWindow_end;
	if (this->_application != ROSTER_OPTIMIZER && !rosters.empty())
	{
		rollingWindow_start = rosters[0]->actStrUtc;
		rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
	}
	else
	{
		rollingWindow_start = this->_dbData->scenario.startDtUTC;
		rollingWindow_end = this->_dbData->scenario.endDtUTC;
	}
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	int baseOffsetTZMinutes = RosterUtils::GetTimeZoneOffset(rollingWindow_start, crew, this->GetDataContext());
	string weekdayStartFrom = this->GetDataContext()->getWeekdayStartFrom();
	bool passAllRule = true;
	
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("limit", to_string(ruleParam._maxLayoverTimes));
		_ruleViolation.SetParam("stations", joinStrList(ruleParam._layoverStations, ","));
		_ruleViolation.SetParam("period", to_string(ruleParam._period));
		_ruleViolation.SetParam("unit", ruleParam._unit);

		map<time_t, time_t> mp;
		if (ruleParam._unit == "CM")
		{
			mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end + 24 * 3600, baseOffsetTZMinutes, ruleParam._period);
		}
		else if (ruleParam._unit == "CW")
		{
			mp = Utility::GetInstancePtr()->getWeeksRollingWindows(rollingWindow_start - (ruleParam._period * 7 - 1) * 24 * 3600, rollingWindow_end + (ruleParam._period * 7 - 1) * 24 * 3600, weekdayStartFrom, baseOffsetTZMinutes, ruleParam._period);
		}
		else if (ruleParam._unit == "CD")
		{
			mp = Utility::GetInstancePtr()->getDaysRollingWindows(rollingWindow_start - (ruleParam._period - 1) * 24 * 3600, rollingWindow_end + (ruleParam._period - 1) * 24 * 3600, baseOffsetTZMinutes, ruleParam._period);
		}
		else
			return true;
		
		for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); ++mp_it) {
			_ruleViolation.SetParam("start", to_string(mp_it->first));
			_ruleViolation.SetParam("end", to_string(mp_it->second));
			int count = 0;
			for (size_t i = 0; i < rosters.size(); i++) {
				if (!rosters[i]->pairing)
					continue;

				if (rosters[i]->actEndLoc < mp_it->first || rosters[i]->actStrLoc > mp_it->second)
					continue;
				const auto& duties = rosters[i]->pairing->getDutyVec();
				for (size_t j = 0; j < duties.size() - 1; j++) {
					if (duties[j]->getStartTimeUtcAct() + baseOffsetTZMinutes * 60 < mp_it->first || duties[j]->getStartTimeUtcAct() + baseOffsetTZMinutes * 60 > mp_it->second)
						continue;
					if (find(ruleParam._layoverStations.begin(), ruleParam._layoverStations.end(), duties[j]->getArrivalStation()) != ruleParam._layoverStations.end())
						++count;
				}
			}
			if (count > ruleParam._maxLayoverTimes) {
				if (this->_application == ROSTER_OPTIMIZER)
					return false;
				_ruleViolation.SetParam("count", to_string(count));
				ThrowRuleViolation();
				passAllRule = false;
			}
		}
		
	}
	
	return passAllRule;
}

void CheckMaxLayoversInTripsForMonthRule::ThrowRuleViolation() const {

	string count = _ruleViolation.GetParam("count");
	string limit = _ruleViolation.GetParam("limit");
	string stations = _ruleViolation.GetParam("stations");
	string period = _ruleViolation.GetParam("period");
	string unit = _ruleViolation.GetParam("unit");
	
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	std::string msg = "The number of layover({0:count}) is exceed the limitation({1:limit}) at the station({2:stations}) in {3:period} {4:unit}.";
	msg = StringUtils::Format(msg, count, limit, stations, unit);

	RULE_VIOLATION* rv = new RULE_VIOLATION();

	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxLayoversInTripsForMonthRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxLayoversInTripsForMonthRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}