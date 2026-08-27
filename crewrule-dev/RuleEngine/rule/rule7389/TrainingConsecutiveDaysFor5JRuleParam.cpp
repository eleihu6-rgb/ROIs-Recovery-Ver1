/**
 * @file TrainingConsecutiveDaysFor5JRuleParam.cpp
 * @brief 7389法规参数类实现 - 课程连续X天之后要安排Y天休假
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-08
**/

#include "../RuleSytem.h"
#include "TrainingConsecutiveDaysFor5JRuleParam.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "Log/Logger.h"

void TrainingConsecutiveDaysFor5JRuleParam::ParseParam(const std::string& paramString) {
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
			case enum_to_underlying(ParamLocation::TYPE):
				_type = substr;
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void TrainingConsecutiveDaysFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
		header = iter->first;
		headerValue = iter->second;
		if (header == "BASES") {
			if (headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headerValue != RuleParamConstant::ALL) {
				split(headerValue, '|', _teams);
			}
		}
		else if (header == "TYPE") {
			_type = headerValue;
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool TrainingConsecutiveDaysFor5JRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool TrainingConsecutiveDaysFor5JRuleParam::MatchParam(const ROSTER& roster) const {
	return true;
}

int TrainingConsecutiveDaysFor5JRuleParam::CheckParam(const ROSTER& roster) const {
	return static_cast<int>(WarnCode::NO_WARN);
}