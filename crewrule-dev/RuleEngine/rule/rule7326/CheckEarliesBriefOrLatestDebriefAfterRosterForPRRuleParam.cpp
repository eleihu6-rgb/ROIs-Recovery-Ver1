/**
 * @file CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-21
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				_strPairingAttributes = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingAttributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BEFORE_OR_AFTER_ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _beforeAssignments);
					split(substr, '|', _afterAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BEFORE_OR_AFTER_ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _beforeAssignmentGroups);
					split(substr, '|', _afterAssignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_ASSIGNMENT_DAYS): {
				_consecutiveAssignmentDays = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_consecutiveAssignmentDaysLower = atoi(splitstrs[0].c_str());
						_consecutiveAssignmentDaysUpper = atoi(splitstrs[1].c_str());
					}
				}
				break;
			}
																					 
			case enum_to_underlying(ParamLocation::EARLIEST_BRIEF_AFTER_ROSTER): {
				_earliestBriefAfterRoster = substr;
				_earliestBriefAfterRosterMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::LATEST_DEBRIEF_BEFORE_ROSTER): {
				_latestDebriefBeforeRoster = substr;
				_latestDebriefBeforeRosterMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Attributes,Assignments,Assignment Groups,Before/After Assignments,Before/After Assignment Groups,Consecutive Assignment Days,Earliest Start After Roster,Latest End Before Roster
		if (header == "BASES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ATTRIBUTES") {
			_strPairingAttributes = headeValue;
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingAttributes);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "ASSIGNMENT GROUPS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroups);
			}
		}
		else if (header == "BEFORE/AFTER ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _beforeAssignments);
				split(headeValue, '|', _afterAssignments);
			}
		}
		else if (header == "BEFORE/AFTER ASSIGNMENT GROUPS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _beforeAssignmentGroups);
				split(headeValue, '|', _afterAssignmentGroups);
			}
		}
		else if (header == "CONSECUTIVE ASSIGNMENT DAYS") {
			_consecutiveAssignmentDays = headeValue;
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_consecutiveAssignmentDaysLower = atoi(splitstrs[0].c_str());
					_consecutiveAssignmentDaysUpper = atoi(splitstrs[1].c_str());
				}
				else {
					_consecutiveAssignmentDaysLower = atoi(headeValue.c_str());
					_consecutiveAssignmentDaysUpper = _consecutiveAssignmentDaysLower + 1;
				}
			}
		}
		else if (header == "EARLIEST BRIEF AFTER ROSTER" || header == "EARLIEST START AFTER ROSTER") {
			_earliestBriefAfterRoster = headeValue;
			_earliestBriefAfterRosterMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "LATEST DEBRIEF BEFORE ROSTER" || header == "LATEST END BEFORE ROSTER") {
			_latestDebriefBeforeRoster = headeValue;
			_latestDebriefBeforeRosterMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchAttributes(const string& strAttribute) const {
	if (_pairingAttributes.empty()) {
		return true;
	}
	bool foundAttr = false;
	std::vector<std::string> attributes;
	split(strAttribute, '|', attributes);
	for (const auto& attr : attributes) {
		if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchParam(const ROSTER* currRoster) const {
	if (currRoster->pairing != nullptr && !MatchAttributes(currRoster->pairing->getAttribute())) {
		return false;
	}
	if (currRoster->pairing == nullptr && !MatchAttributes(currRoster->attribute)) {
		return false;
	}
	if (!MatchRosterAssignment(currRoster)) {
		return false;
	}

	if (!MatchRosterAssignmentGroup(currRoster)) {
		return false;
	}
    return true;
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchRosterAssignment(const ROSTER* roster) const {
	if (_assignments.empty()) {
		return true;
	}
	return std::find(_assignments.cbegin(), _assignments.cend(), roster->qualifier) != _assignments.cend();
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchRosterAssignmentGroup(const ROSTER* roster) const {
	if (_assignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(roster->qualifier, _assignmentGroups);
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchBeforeRosterAssignment(const ROSTER* beforeRoster) const {
	if (_beforeAssignments.empty()) {
		return true;
	}
	return std::find(_beforeAssignments.cbegin(), _beforeAssignments.cend(), beforeRoster->qualifier) != _beforeAssignments.cend();
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchBeforeRosterAssignmentGroup(const ROSTER* beforeRoster) const {
	if (_beforeAssignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(beforeRoster->qualifier, _beforeAssignmentGroups);
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchAfterRosterAssignment(const ROSTER* afterRoster) const {
	if (_afterAssignments.empty()) {
		return true;
	}
	return std::find(_afterAssignments.cbegin(), _afterAssignments.cend(), afterRoster->qualifier) != _afterAssignments.cend();
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam::MatchAfterRosterAssignmentGroup(const ROSTER* afterRoster) const {
	if (_afterAssignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(afterRoster->qualifier, _afterAssignmentGroups);
}