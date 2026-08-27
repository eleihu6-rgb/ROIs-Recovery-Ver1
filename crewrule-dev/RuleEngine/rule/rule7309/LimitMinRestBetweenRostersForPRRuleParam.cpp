/**
 * @file LimitMinRestBetweenRostersForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitMinRestBetweenRostersForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitMinRestBetweenRostersForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
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
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				_strPairingAttributes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingAttributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::OVERRIDABLE_ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _overridableRosterAssignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_TYPE): {
				_rosterConsecutiveType = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_TIMES): {
				_strRosterConsecutiveTimesOrDays = substr.c_str();

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_rosterConsecutiveTimesOrDaysLower = atoi(splitstrs[0].c_str());
					_rosterConsecutiveTimesOrDaysUpper = atoi(splitstrs[1].c_str());
				}
				else {
					_maxRosterConsecutiveTimesOrDays = atoi(substr.c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDE_PAIRING_REST): {
				_isIncludePairingRest = (substr == RuleParamConstant::IGNORED) ? true : (substr == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::COUNTING_REST_FROM_PAIRING_END_DAY): {
				_isCountingRestFromPairingEndDay = (substr == RuleParamConstant::IGNORED) ? true : (substr == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::DIRECTION): {
				_restDirection = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::REST_TYPE): {
				_restType = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST): {
				_minRest = substr;
				if (TimeUtils::isHHmm(_minRest.c_str())) {
					_minRestMinutes = TimeUtils::hhmmToMinutes(_minRest);
				}
				else {
					_minDayOffDays = atof(_minRest.c_str());
				}
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

void LimitMinRestBetweenRostersForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Assignment Groups,Assignments,Attributes,Overridable Assignment Groups,Consecutive Type,Consecutive Times,Include Pairing Rest(Y/N),Counting Rest from Pairing End Day(Y/N),Direction,Rest Type,Min Rest
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
		else if (header == "ASSIGNMENT GROUPS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _rosterAssignmentGroups);
			}
		}		
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _rosterAssignments);
			}
		}
		else if (header == "ATTRIBUTES") {
			_strPairingAttributes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingAttributes);
			}
		}
		else if (header == "OVERRIDABLE ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _overridableRosterAssignmentGroups);
			}
		}
		else if (header == "CONSECUTIVE TYPE") {
			_rosterConsecutiveType = strToUpper(headeValue);
		}
		else if (header == "CONSECUTIVE TIMES") {
			_strRosterConsecutiveTimesOrDays = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_rosterConsecutiveTimesOrDaysLower = atoi(splitstrs[0].c_str());
				_rosterConsecutiveTimesOrDaysUpper = atoi(splitstrs[1].c_str());
			}
			else {
				_maxRosterConsecutiveTimesOrDays = atoi(headeValue.c_str());
            }
		}
		else if (header == "INCLUDE PAIRING REST(Y/N)") {
			_isIncludePairingRest = (headeValue == RuleParamConstant::IGNORED) ? true : (headeValue == "Y");
		}
		else if (header == "COUNTING REST FROM PAIRING END DAY(Y/N)") {
			_isCountingRestFromPairingEndDay = (headeValue == RuleParamConstant::IGNORED) ? true : (headeValue == "Y");
		}
		else if (header == "DIRECTION") {
			_restDirection = strToUpper(headeValue);
		}
		else if (header == "REST TYPE") {
			_restType = strToUpper(headeValue);
		}
		else if (header == "MIN REST") {
			_minRest = headeValue;
			if (TimeUtils::isHHmm(_minRest.c_str())) {
				_minRestMinutes = TimeUtils::hhmmToMinutes(_minRest);
			}
			else {
				_minDayOffDays = atof(_minRest.c_str());
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchRosterAssignment(const std::string& assignment) const {
	if (_rosterAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_rosterAssignments.cbegin(), _rosterAssignments.cend(), assignment);
	return iter != _rosterAssignments.cend();
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchRosterAssignmentGroups(const ROSTER* roster) const {
	if (_rosterAssignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(roster->qualifier, this->_rosterAssignmentGroups);
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchPairingAttributes(const ROSTER* roster) const {
	if (_pairingAttributes.empty()) {
		return true;
	}
	string attribute = "";
	if (roster->pairing) {
		attribute = roster->pairing->getAttribute();
	}
	else {
		attribute = roster->attribute;
	}
	if (attribute.empty())
		return false;
	bool foundAttr = false;
	std::vector<std::string> attributes;
	split(attribute, '|', attributes);
	for (const auto& attr : attributes) {
		if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchParam(const ROSTER* roster) const {

	if (!MatchRosterAssignmentGroups(roster)) {
		return false;
	}

	if (!MatchRosterAssignment(roster->qualifier)) {
		return false;
	}

	if (!MatchPairingAttributes(roster)) {
		return false;
	}

	return true;
}


bool LimitMinRestBetweenRostersForPRRuleParam::IsRestAssignment(const ROSTER* roster) const {
	if (this->_overridableRosterAssignmentGroups.empty()) {
		return false;
    }
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(roster->qualifier, this->_overridableRosterAssignmentGroups);
}

bool LimitMinRestBetweenRostersForPRRuleParam::MatchConsecutiveTimesOrDays(const int consecutiveTimesOrDays, const int totalConsecutiveTimesOrDays) const {
	if (this->_maxRosterConsecutiveTimesOrDays > 0) {
		//只要满足连续次数或天数达到最大值要求，就不需要区分是连续工作还是连续被断开了。比如：连续工作达到10天的Roster，或者连续被断开达到10天的Roster，都不需要满足休息要求。只要连续达到10天，就满足要求，不需要区分是连续工作还是连续被断开。
		return totalConsecutiveTimesOrDays >= this->_maxRosterConsecutiveTimesOrDays;
	}
	else if (consecutiveTimesOrDays < 0 && this->_rosterConsecutiveTimesOrDaysLower > 0 && this->_rosterConsecutiveTimesOrDaysUpper > 0) {
		//必须连续被断开，才需要满足连续次数或天数要求。比如：连续被断开8-10天的Roster，才需要满足休息要求。只要连续被断开达到8天，就满足要求，不需要达到10天。
		return totalConsecutiveTimesOrDays >= this->_rosterConsecutiveTimesOrDaysLower
			&& totalConsecutiveTimesOrDays < this->_rosterConsecutiveTimesOrDaysUpper;
	}
	return false;
}