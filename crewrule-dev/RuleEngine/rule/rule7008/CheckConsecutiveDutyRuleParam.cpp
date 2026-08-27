#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckConsecutiveDutyRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckConsecutiveDutyRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "ASSIGNMENTS")
			split(headeValue, '|', _assignments);
		else if (header == "ASSIGNMENT GROUPS")
			split(headeValue, '|', _assignmentGroups);
		else if (header == "ATTRIBUTES")
			split(headeValue, '|', _attributes);
		else if (header == "MAX CONSECUTIVE DAY")
			_maxConsecutiveDays = atoi(headeValue.c_str());
		else if (header == "MIN REST DAYS")
			_minRestDays = atoi(headeValue.c_str());

	}
}


bool CheckConsecutiveDutyRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckConsecutiveDutyRuleParam::MatchAssignment(const std::string& assignment) const {
	if (_assignments.size() > 0 && _assignments[0] != "*" && find(_assignments.begin(), _assignments.end(), assignment) == _assignments.end())
		return false;
	return true;
}

bool CheckConsecutiveDutyRuleParam::MatchAssignmentGroup(const std::string& group) const {
	if (_assignmentGroups.size() > 0 && _assignmentGroups[0] != "*" && find(_assignmentGroups.begin(), _assignmentGroups.end(), group) == _assignmentGroups.end())
		return false;
	return true;
}