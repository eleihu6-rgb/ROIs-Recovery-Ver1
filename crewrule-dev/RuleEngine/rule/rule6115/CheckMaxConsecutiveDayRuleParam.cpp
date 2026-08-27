#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckMaxConsecutiveDayRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckMaxConsecutiveDayRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != "*") {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "MAX CONSECUTIVE DAY")
			_maxConsecutiveTime = (headeValue == "*" || headeValue == "") ? 0 : stoi(headeValue);
		else if (header == "ADD MAX CONSECUTIVE DAY")
			_addMaxConsecutiveTime = atoi(headeValue.c_str());
		else if (header == "ADD MAX TIMES")
			_addMaxNumber = atoi(headeValue.c_str());
		else if (header == "UNIT")
			_unit = headeValue;
		else if (header == "MAX CONSECUTIVE DAY IN RP")
			_maxConsecutiveDayInRP = (headeValue == "*" || headeValue == "") ? 0 : stoi(headeValue);
		else if (header == "IS ADD MAX IN RP")
			_isAddMaxInRP = headeValue;
	}
}

bool CheckMaxConsecutiveDayRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> teams;
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}