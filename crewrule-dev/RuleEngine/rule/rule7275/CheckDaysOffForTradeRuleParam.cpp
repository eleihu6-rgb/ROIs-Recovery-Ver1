#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckDaysOffForTradeRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CheckDaysOffForTradeRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		else if (header == "TEAMS")
			split(headeValue, '|', _teams);
		else if (header == "DO ASSIGNMENT GROUPS")
			split(headeValue, '|', _doAssignmentGroups);
		else if (header == "MIN DO")
			_minDO = atoi(headeValue.c_str());
		else if (header == "START MONTH")
			_startMonth = atoi(headeValue.c_str());
		else if (header == "END MONTH")
			_endMonth = atoi(headeValue.c_str());
		else if (header == "UTILIZE POST DUTY REST")
			_utilizePostDutyRest = headeValue == "Y";
		else if (header == "COUNT BLANK DAY")
			_countBlankDay = headeValue == "Y";
		else if (header == "COUNT LAYOVER")
			_countLayover = headeValue == "Y";
		else if (header == "LAYOVER TIMEMODE")
			_layoverTimemode = headeValue;

	}
}

bool CheckDaysOffForTradeRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

int CheckDaysOffForTradeRuleParam::GetDaysOffByRosters(const std::vector<const ROSTER*>& rosters) const {
	int number = 0;
	


	/*for (const auto& roster : rosters) {
		if (daysOffs.empty() || find(daysOffs.begin(), daysOffs.end(), roster->qualifier) == daysOffs.end()) {
			continue;
		}
		const auto& rosterDate = roster->getStartTimeLocAct();
		const auto& mon = TimeUtils::GetMonth(rosterDate);
		if (mon < _startMonth || mon > _endMonth) {
			continue;
		}
		++number;
	}*/
	return number;
}

int CheckDaysOffForTradeRuleParam::GetDaysOffByMandayFD(const vector<std::shared_ptr<CREW_MANDAY_FD>>& mandayList, const time_t & countStart, const time_t & countEnd, const time_t & exceptStart, const time_t & exceptEnd) const {
	int number = 0;
	for (const auto& manday : mandayList) {
		if (manday->DAY_OFF != DAY_OFF_EXIST)
			continue;

		const auto& startDayOfExceptStart = TimeUtils::GetStartTimeOfDay(exceptStart);
		const auto& startDayOfExceptEnd = TimeUtils::GetStartTimeOfDay(exceptEnd);

		if (manday->dateLoc >= startDayOfExceptStart && manday->dateLoc <= startDayOfExceptEnd)
			continue;

		if (manday->dateLoc < countStart || manday->dateLoc > countEnd)
			continue;

		const auto& mon = TimeUtils::GetMonth(manday->dateLoc);
		if (mon < _startMonth || mon > _endMonth) {
			continue;
		}
		++number;
	}
	return number;
}

int CheckDaysOffForTradeRuleParam::GetDaysOffByMandayCC(const vector<std::shared_ptr<CREW_MANDAY_CC_AM>>& mandayList, const time_t& countStart, const time_t& countEnd, const time_t & exceptStart, const time_t & exceptEnd) const {
	int number = 0;
	for (const auto& manday : mandayList) {
		if (manday->DAY_OFF != DAY_OFF_EXIST)
			continue;

		const auto& startDayOfExceptStart = TimeUtils::GetStartTimeOfDay(exceptStart);
		const auto& startDayOfExceptEnd = TimeUtils::GetStartTimeOfDay(exceptEnd);

		if (manday->dateLoc >= startDayOfExceptStart && manday->dateLoc <= startDayOfExceptEnd)
			continue;

		if (manday->dateLoc < countStart || manday->dateLoc > countEnd)
			continue;

		const auto& mon = TimeUtils::GetMonth(manday->dateLoc);
		if (mon < _startMonth || mon > _endMonth) {
			continue;
		}
		++number;
	}
	return number;
}