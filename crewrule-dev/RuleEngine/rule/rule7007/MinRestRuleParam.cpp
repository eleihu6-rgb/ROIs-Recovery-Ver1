#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "MinRestRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void MinRestRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "PERIOD")
			_period = atoi(headeValue.c_str());
		else if (header == "UNIT")
			_unit = headeValue;
		else if (header == "MIN LOCAL DAY FREE")
			_minLocalDayFree = atoi(headeValue.c_str());
		else if (header == "DO ASSIGNMENTS") {
			if (headeValue != "*") {
				split(headeValue, '|', _daysOffAssignments);
			}
		}
		else if (header == "DO ASSIGNMENT GROUPS") {
			if (headeValue != "*") {
				split(headeValue, '|', _daysOffAssignmentGroups);
			}
		}
		else if (header == "UTILIZE POST DUTY REST")
			_utilizePostDutyRest = headeValue == "Y";
		else if (header == "COUNT BLANK DAY")
			_countBlankDay = headeValue == "Y";
			
	}
}

bool MinRestRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}