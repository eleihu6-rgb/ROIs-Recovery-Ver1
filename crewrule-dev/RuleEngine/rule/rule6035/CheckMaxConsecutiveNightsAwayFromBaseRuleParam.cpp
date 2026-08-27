#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckMaxConsecutiveNightsAwayFromBaseRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckMaxConsecutiveNightsAwayFromBaseRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "MAX TIMES")
			_maxTimes = atoi(headeValue.c_str());
		else if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		
	}
}

