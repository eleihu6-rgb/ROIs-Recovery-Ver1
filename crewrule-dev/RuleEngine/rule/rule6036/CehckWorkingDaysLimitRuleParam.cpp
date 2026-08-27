#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CehckWorkingDaysLimitRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CehckWorkingDaysLimitRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "MIN TIMES")
			_minTimes = atoi(headeValue.c_str());
		else if (header == "DUTY ASSIGNMENTS")
			split(headeValue, '|', _dutyAssignments);
		else if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		else if (header == "EXCLUDING TEAMS")
			_excludingTeams = headeValue;

	}
}

