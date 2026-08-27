#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam.h"
#include "CrewDB.h"

using namespace std;

void CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "DUTY EARIER THAN")
			_dutyEarierThan = stoi(headeValue.substr(0, headeValue.find(":"))) * 60 + stoi(headeValue.substr(headeValue.find(":") + 1));
		else if (header == "MAX TIMES")
			_maxTimes = atoi(headeValue.c_str());
		else if (header == "PERIOD")
			_period = atoi(headeValue.c_str());
		else if (header == "UNIT")
			_unit = headeValue;
		else if (header == "CHECK TYPE")
			_checkType = headeValue;
		else if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		else if (header == "CHECK ASSIGNMENTS")
			split(headeValue, '|', _checkAssignments);
		else if (header == "CHECK ASSIGNMENT GROUPS")
			split(headeValue, '|', _checkAssignmentGroups);
	}
}

bool CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam::MatchAssignment(const string assignment) const {

	// 没有配置默认FLY
	if ((_checkAssignmentGroups.size() == 0 || _checkAssignmentGroups[0] == "") && (_checkAssignments.size() == 0 || _checkAssignments[0] == ""))
		return assignment == "FLY";
	// 全是*直接返回true
	if (_checkAssignmentGroups[0] == "*" && _checkAssignments[0] == "*")
		return true;

	if (_checkAssignmentGroups[0] != "*" && !CheckAssignmentGroup(assignment))
		return false;

	if (_checkAssignments[0] != "*" && !CheckAssignment(assignment))
		return false;
	
	return true;
}

bool CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam::CheckAssignmentGroup(const string assignment) const {
	
	if (_checkAssignmentGroups.size() > 0 && _checkAssignmentGroups[0] != "*" && _checkAssignmentGroups[0] != "") {
		for (const auto& group : _checkAssignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, group)) {
				return true;
			}
		}
	}
	return false;
}

bool CheckMaxEarlyDutyInAnyConsecutiveDayRuleParam::CheckAssignment(const string assignment) const {
	if (_checkAssignments.size() > 0 && _checkAssignments[0] != "*" && _checkAssignments[0] != "") {
		if (find(_checkAssignments.begin(), _checkAssignments.end(), assignment) != _checkAssignments.end())
			return true;
	}
	return false;
}