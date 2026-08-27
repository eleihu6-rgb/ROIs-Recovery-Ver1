/**
 * @file LimitMinRestLFESFlightForPRRuleParam.h
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
#include "LimitMinRestLFESFlightForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitMinRestLFESFlightForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENT_GROUPS): {
				_dutyAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				_dutyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_TIME_RANGES): {
				_dutyTimeRanges = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_dutyTimeRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dutyTimeHHmmLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dutyTimeHHmmUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingAttributes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_TURNAROUND): {
				_isTurnaround = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
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

void LimitMinRestLFESFlightForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Duty Assignment Groups,Duty Assignments,Duty Time Ranges,Attributes,is Turnaround(Y/N),Max Consecutive Times
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
		else if (header == "DUTY ASSIGNMENT GROUPS") {
			_dutyAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY ASSIGNMENTS") {
			_dutyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY TIME RANGES") {
			_dutyTimeRanges = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_dutyTimeRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_dutyTimeHHmmLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_dutyTimeHHmmUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "ATTRIBUTES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingAttributes);
			}
		}
		else if (header == "IS TURNAROUND(Y/N)") {
			_isTurnaround = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
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

bool LimitMinRestLFESFlightForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitMinRestLFESFlightForPRRuleParam::MatchDutyTimeRanges(const Duty* duty) const {
	time_t startTimeLocAct = duty->getStartTimeLocAct();
	time_t endTimeLocAct = duty->getEndTimeLocAct();
	return TimeUtils::IsTimesCovered(startTimeLocAct, endTimeLocAct, this->_dutyTimeHHmmLower, this->_dutyTimeHHmmUpper);
}

bool LimitMinRestLFESFlightForPRRuleParam::MatchPairingAttributes(const Pairing* pairing) const {
	if (_pairingAttributes.empty()) {
		return true;
	}
	if (pairing == nullptr) {
		return false;
	}
	bool foundAttr = false;
	std::vector<std::string> attributes;
	split(pairing->getAttribute(), '|', attributes);
	for (const auto& attr : attributes) {
		if (std::find(_pairingAttributes.begin(), _pairingAttributes.end(), attr) != _pairingAttributes.end()) {
			foundAttr = true;
			break;
		}
	}
	return foundAttr;
}

bool LimitMinRestLFESFlightForPRRuleParam::MatchTurnaround(const Pairing* pairing) const {
	if (_isTurnaround == nullptr) {
		return true;
	}
	int dutyNum = (int)pairing->getNumDuties();
	bool isTurnaround = false;
	if (dutyNum == 1) {
		isTurnaround = true;
	}
	return *(_isTurnaround.get()) == isTurnaround;
}

bool LimitMinRestLFESFlightForPRRuleParam::MatchParam(const Duty* duty, const Pairing* pairing) const {

	if (!_dutyAssignmentGroupsMatch.Match(*duty)) {
		return false;
	}

	if (!_dutyAssignmentsMatch.Match(*duty)) {
		return false;
	}

	if (!MatchDutyTimeRanges(duty)) {
		return false;
	}

	if (!MatchPairingAttributes(pairing)) {
		return false;
	}

	if (!MatchTurnaround(pairing)) {
		return false;
	}

	return true;
}