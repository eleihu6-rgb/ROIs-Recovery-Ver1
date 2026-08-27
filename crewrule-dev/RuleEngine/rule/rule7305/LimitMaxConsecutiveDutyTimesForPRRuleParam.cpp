/**
 * @file LimitMaxConsecutiveDutyTimesForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-07
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitMaxConsecutiveDutyTimesForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitMaxConsecutiveDutyTimesForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::POSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _positions);
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
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _rosterAssignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _rosterAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LABELS): {
				_strPairingLabels = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingLabels);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				_strPairingAttributes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingAttributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_TYPE): {
				_consecutiveType = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_CONSECUTIVE_TIMES): {
				_maxConsecutiveTimes = atoi(substr.c_str());
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

void LimitMaxConsecutiveDutyTimesForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Positions,Fleets,Teams,Assignment Groups,Assignments,Labels,Attributes,Consecutive Type(T/D),Max Consecutive Times
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
		else if (header == "POSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _positions);
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
		else if (header == "ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _rosterAssignmentGroups);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _rosterAssignments);
			}
		}
		else if (header == "LABELS") {
			_strPairingLabels = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingLabels);
			}
		}
		else if (header == "ATTRIBUTES") {
			_strPairingAttributes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingAttributes);
			}
		}
		else if (header == "CONSECUTIVE TYPE(T/D)") {
			_consecutiveType = strToUpper(headeValue);
		}
		else if (header == "MAX CONSECUTIVE TIMES") {
			_maxConsecutiveTimes = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, _positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchAssignments(const std::string& assignment) const {
	if (_rosterAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_rosterAssignments.cbegin(), _rosterAssignments.cend(), assignment);
	return iter != _rosterAssignments.cend();
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchAssignmentGroups(const string& assignment) const {
	if (_rosterAssignmentGroups.empty()) {
		return true;
	}

	auto& dbData = this->GetRule()->GetDataContext();
	for (auto assignmentGroup : _rosterAssignmentGroups) {
		if (dbData->isAssignmentInGroup(assignment, assignmentGroup)) {
			return true;
		}
	}
	return false;
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchPairingAttributes(const ROSTER* roster) const {
	if (_pairingAttributes.empty()) {
		return true;
	}
	bool foundAttr = false;

	if (roster->pairing == nullptr) {
		std::vector<std::string> attributes;
		split(roster->attribute, '|', attributes);
		for (const auto& attr : attributes) {
			if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
				foundAttr = true;
				break;
			}
		}
	}
	else {
		std::vector<std::string> attributes;
		split(roster->pairing->getAttribute(), '|', attributes);
		for (const auto& attr : attributes) {
			if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
				foundAttr = true;
				break;
			}
		}
	}
	
	return foundAttr;
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchPairingLabels(const ROSTER* roster) const {
	if (_pairingLabels.empty()) {
		return true;
	}
	if (roster->pairing == nullptr) {
		return false;
	}
	return std::find(_pairingLabels.begin(), _pairingLabels.end(), roster->pairing->getLabel()) != _pairingLabels.end();
}

bool LimitMaxConsecutiveDutyTimesForPRRuleParam::MatchParam(const ROSTER* roster) const {

	if (!MatchAssignments(roster->qualifier)) {
		return false;
	}

	if (!MatchAssignmentGroups(roster->qualifier)) {
		return false;
	}

	if (!MatchPairingAttributes(roster)) {
		return false;
	}

	if (!MatchPairingLabels(roster)) {
		return false;
	}

	return true;
}