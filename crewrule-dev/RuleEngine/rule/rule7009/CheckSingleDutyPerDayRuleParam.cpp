#include <sstream>
#include <map>
#include <algorithm>
#include <cctype>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckSingleDutyPerDayRuleParam.h"
#include "../constant/Constants.h"
#include "CrewDB.h"
#include "utils/TimeUtils.h"

using namespace std;

void CheckSingleDutyPerDayRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsA);
				split(headeValue, '|', _assignmentGroupsB);
				_assignmentGroupsAMatch.SetExpression(headeValue, this->GetRule());
				_assignmentGroupsBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENT" || header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsA);
				split(headeValue, '|', _assignmentsB);
				_assignmentsAMatch.SetExpression(headeValue, this->GetRule());
				_assignmentsBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENT GROUPS A") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsA);
				_assignmentGroupsAMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENTS A") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsA);
				_assignmentsAMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENT GROUPS B") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsB);
				_assignmentGroupsBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENTS B") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsB);
				_assignmentsBMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "PREV ROSTER THRESHOLD") {
			_prevRosterThreshold = headeValue;
			_prevRosterThresholdMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "PREV ROSTER START" || header == "PREV LEVEL CHECK PERIOD")
			_prevRosterStart = headeValue;
		else if (header == "NEXT ROSTER END" || header == "NEXT LEVEL CHECK PERIOD")
			_nextRosterEnd = headeValue;
		else if (header == "FLEET GROUPS")
			split(headeValue, '|', _fleetGroups);
		else if (header == "LEVEL")
			_level = headeValue;
		else if (header == "TIME ZONE") {
			std::string tz = headeValue;
			std::transform(tz.begin(), tz.end(), tz.begin(),
				[](unsigned char c) { return static_cast<char>(std::toupper(c)); });
			if (tz == "BASE" || tz == "B") {
				_timeZone = "BASE";
			}
			else {
				_timeZone = "LOCAL";
			}
		}
		
	}
}

bool CheckSingleDutyPerDayRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckSingleDutyPerDayRuleParam::MatchAssignmentA(const Activity* activity) const {
	if (!_assignmentsAMatch.Match(*activity)) {
		return false;
	}
	if (!_assignmentGroupsAMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckSingleDutyPerDayRuleParam::MatchAssignmentB(const Activity* activity) const {
	if (!_assignmentsBMatch.Match(*activity)) {
		return false;
	}
	if (!_assignmentGroupsBMatch.Match(*activity)) {
		return false;
	}
	return true;
}

bool CheckSingleDutyPerDayRuleParam::MatchFleetGroups(const ROSTER* roster) const {

	if (_fleetGroups.empty() || _fleetGroups[0] == "*")
		return true;

	if (!roster->pairing)
		return false;


	const auto& segs = roster->pairing->getSegmentsRead();
	bool hasFleetGroup = false;
	for (const auto& seg : segs) {
		auto fleetIter = this->GetRule()->GetDataContext()->fleetMap.find(seg->getFleetCD());
		if (fleetIter != this->GetRule()->GetDataContext()->fleetMap.end()) {
			auto fleetGroup = fleetIter->second.fleetGrp;
			if (find(_fleetGroups.begin(), _fleetGroups.end(), fleetGroup) != _fleetGroups.end()) {
				hasFleetGroup = true;
				break;
			}
		}
	}
	return hasFleetGroup;
}

bool CheckSingleDutyPerDayRuleParam::MatchFleetGroups(const Duty* duty) const {

	if (_fleetGroups.empty() || _fleetGroups[0] == "*")
		return true;

	const auto& segs = duty->getSegmentsRead();
	bool hasFleetGroup = false;
	for (const auto& seg : segs) {
		auto fleetIter = this->GetRule()->GetDataContext()->fleetMap.find(seg->getFleetCD());
		if (fleetIter != this->GetRule()->GetDataContext()->fleetMap.end()) {
			auto fleetGroup = fleetIter->second.fleetGrp;
			if (find(_fleetGroups.begin(), _fleetGroups.end(), fleetGroup) != _fleetGroups.end()) {
				hasFleetGroup = true;
				break;
			}
		}
	}
	return hasFleetGroup;
}

bool CheckSingleDutyPerDayRuleParam::MatchFleetGroups(const Segment* segment) const {

	if (_fleetGroups.empty() || _fleetGroups[0] == "*")
		return true;

	auto fleetIter = this->GetRule()->GetDataContext()->fleetMap.find(segment->getFleetCD());
	if (fleetIter != this->GetRule()->GetDataContext()->fleetMap.end()) {
		auto fleetGroup = fleetIter->second.fleetGrp;
		if (find(_fleetGroups.begin(), _fleetGroups.end(), fleetGroup) != _fleetGroups.end()) {
			return true;
		}
	}
	
	return false;
}
