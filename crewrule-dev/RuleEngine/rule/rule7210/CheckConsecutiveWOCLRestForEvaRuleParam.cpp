#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckConsecutiveWOCLRestForEvaRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CheckConsecutiveWOCLRestForEvaRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "WOCL START")
			_woclStart = headeValue == "*" ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "WOCL END")
			_woclEnd = headeValue == "*" ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		else if (header == "MAX CONSECUTIVE WOCL NUMBER")
			_maxConsecutiveWoclNumber = atoi(headeValue.c_str());
		else if (header == "MIN REST")
			split(headeValue.c_str(), '|', _minRests);

	}
}

bool CheckConsecutiveWOCLRestForEvaRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}