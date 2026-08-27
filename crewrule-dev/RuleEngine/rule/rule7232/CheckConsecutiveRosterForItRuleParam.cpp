#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckConsecutiveRosterForItRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckConsecutiveRosterForItRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "ASSIGNMENTS") {
			split(headeValue, '|', _assignments);
			_assignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENT GROUPS") {
			split(headeValue, '|', _assignmentGroups);
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ATTRIBUTES")
			split(headeValue, '|', _attributes);
		else if (header == "MAX CONSECUTIVE ROSTER")
			_maxConsecutiveTime = atoi(headeValue.c_str());
		else if (header == "CONSECUTIVE DEFINITION")
			_consecutiveDefinition = headeValue;

	}
}


bool CheckConsecutiveRosterForItRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckConsecutiveRosterForItRuleParam::MatchAssignmentGroup(const ROSTER* roster) const {
	return _assignmentGroupsMatch.Match(*roster);
		
}

bool CheckConsecutiveRosterForItRuleParam::MatchAssignment(const ROSTER* roster) const {
	return _assignmentsMatch.Match(*roster);
}