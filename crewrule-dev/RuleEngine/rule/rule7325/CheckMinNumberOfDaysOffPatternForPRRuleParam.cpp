/**
 * @file CheckMinNumberOfDaysOffPatternForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckMinNumberOfDaysOffPatternForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckMinNumberOfDaysOffPatternForPRRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::LEAVE_DAYS): {
				_leaveDays = substr;
				if (substr != RuleParamConstant::ALL) {
					if (substr.find("-") != string::npos) {
						_leaveDaysStart = stoi(substr.substr(0, substr.find("-")));
						_leaveDaysEnd = stoi(substr.substr(substr.find("-") + 1));
					}
				}
			}
			case enum_to_underlying(ParamLocation::PREFERRED_DO_PATTERNS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _preferredDoPattern);
				}
			}
			case enum_to_underlying(ParamLocation::EXCEPTIONAL_DP_PATTERNS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _exceptionalDoPattern);
				}
			}
			case enum_to_underlying(ParamLocation::SEVERITY): {
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckMinNumberOfDaysOffPatternForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	_rowNum = dbRule.rowNum;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Birthday Assignments,Days Off Before Birthday,Days Off After Birthday,Latest End Time,Earliest Start Time
		if (header == "LEAVE DAYS") {
			_leaveDays = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_leaveDaysStart = stoi(headeValue.substr(0, headeValue.find("-")));
					_leaveDaysEnd = stoi(headeValue.substr(headeValue.find("-") + 1));
				}
			}
		}
		else if (header == "PREFERRED DO PATTERNS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _preferredDoPattern);
			}
		}
		else if (header == "EXCEPTIONAL DO PATTERNS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _exceptionalDoPattern);
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinNumberOfDaysOffPatternForPRRuleParam::MatchAlDays(const int alDay) const {
	if (_leaveDays.empty() || _leaveDays == "*")
		return false;

	return _leaveDaysStart <= alDay && _leaveDaysEnd > alDay;
}