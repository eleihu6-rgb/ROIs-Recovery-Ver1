/**
 * @file LimitMaxDutyPeriodRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "LimitMaxDutyPeriodRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/BaseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void LimitMaxDutyPeriodRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE): {
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(strToUpper(substr) == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignmentGroups);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_DP): {
				_maxDP = substr;
				_maxDPMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DURATION): {
				_minDuration = substr;
				_minDurationMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_DURATION): {
				_maxDuration = substr;
				_maxDurationMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitMaxDutyPeriodRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base,Assignment Groups,Assignments,Max DP,Min Duration,Max Duration
		if (header == "IS HOME BASE") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(strToUpper(headeValue) == RuleParamConstant::YES);
		}
		else if (header == "ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroups);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "MAX DP") {
			_maxDP = headeValue;
			_maxDPMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN DURATION") {
			_minDuration = headeValue;
			_minDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MAX DURATION") {
			_maxDuration = headeValue;
			_maxDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitMaxDutyPeriodRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_assignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

bool LimitMaxDutyPeriodRuleParam::MatchDutyAssignmentGroups(const Duty& duty) const {
	if (_assignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(duty.getAssignment(), _assignmentGroups);
}

//判断是否在基地
bool LimitMaxDutyPeriodRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

bool LimitMaxDutyPeriodRuleParam::MatchHomeBase(const ROSTER& roster, const std::string& base) const {
	return _isHomeBase == nullptr || roster.location == base;
}

//判断地面任务是否满足任务类型
bool LimitMaxDutyPeriodRuleParam::MatchGroundAssignments(const ROSTER& roster) const {
	if (_assignments.empty()) {
		return true;
	}
	string assignment = roster.qualifier;
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

//判断地面任务是否满足任务类型组
bool LimitMaxDutyPeriodRuleParam::MatchGroundAssignmentGroups(const ROSTER& roster) const {
	if (_assignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	return dbData->isAssignmentInGroup(roster.qualifier, _assignmentGroups);
}

//匹配规则参数是否满足
bool LimitMaxDutyPeriodRuleParam::MatchParam(const Duty& duty, const string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!MatchDutyAssignmentGroups(duty)) {
		return false;
	}

	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	return true;
}

bool LimitMaxDutyPeriodRuleParam::MatchParam(const ROSTER& roster, const string& base) const {
	if (!MatchHomeBase(roster, base)) {
		return false;
	}

	if (!MatchGroundAssignmentGroups(roster)) {
		return false;
	}

	if (!MatchGroundAssignments(roster)) {
		return false;
	}
	return true;
}