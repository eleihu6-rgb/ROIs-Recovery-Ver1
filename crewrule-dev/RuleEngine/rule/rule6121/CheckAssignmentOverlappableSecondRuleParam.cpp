/**
 * @file CheckAssignmentOverlappableSecondRuleParam.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "CheckAssignmentOverlappableSecondRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CheckAssignmentOverlappableSecondRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			case enum_to_underlying(ParamLocation::TEAMS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENTS_A):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentsA);
				}
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS_A):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroupsA);
				}
				break;
			case enum_to_underlying(ParamLocation::IS_TRAINING_A):
				_isTrainingA = substr;
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENTS_B):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentsB);
				}
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUSP_B):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroupsB);
				}
				break;
			case enum_to_underlying(ParamLocation::IS_TRAINING_B):
				_isTrainingB = substr;
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckAssignmentOverlappableSecondRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//First FDP Maximum,First ODP Minimum,Second FDP Maximum,Second FDP ACC State,Second ODP Minimum,Second ODP Local Nights,First ODP Reduced to Minimum
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENTS A") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsA);
			}
		}
		else if (header == "ASSIGNMENT GROUPS A") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsA);
			}
		}
		else if (header == "IS TRAINING A") {
			_isTrainingA = headeValue;
		}
		else if (header == "ASSIGNMENTS B") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsB);
			}
		}
		else if (header == "ASSIGNMENT GROUPS B") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsB);
			}
		}
		else if (header == "IS TRAINING B") {
			_isTrainingB = headeValue;
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckAssignmentOverlappableSecondRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckAssignmentOverlappableSecondRuleParam::MatchAssignment(const string assignment, const string checkType) const {

	std::vector<std::string> assignments = checkType == "PREV" ? _assignmentsA : _assignmentsB;
	std::vector<std::string> assignmentGroups = checkType == "PREV" ? _assignmentGroupsA : _assignmentGroupsB;

	if (!assignments.empty() && assignments[0] != "*") {
		if (find(assignments.begin(), assignments.end(), assignment) == assignments.end())
			return false;
	}

	if (!assignmentGroups.empty() && assignmentGroups[0] != "*") {
		bool found = false;
		for (const auto& group : assignmentGroups) {
			if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, group)) {
				found = true;
			}
		}
		if (!found)
			return false;
	}

	return true;
}

bool CheckAssignmentOverlappableSecondRuleParam::MatchTraining(const ROSTER* roster, const string checkType) const {
	string isTraining = checkType == "PREV" ? _isTrainingA : _isTrainingB;
	if (isTraining.empty() || isTraining == "*") {
		return true;
	}

	if (roster->pairing) {
		for (const auto& seg : roster->pairing->getSegmentsRead()) {
			const auto& rf = this->GetRule()->GetDataContext()->rosterFlightMgr.get(seg->getDBId(), roster->idcrew);
			if (!rf->courseCode.empty())
				return isTraining == "Y";
		}
	}
	else {
		if (!roster->tmRole.empty())
			return isTraining == "Y";
	}
	return isTraining == "N";

}
