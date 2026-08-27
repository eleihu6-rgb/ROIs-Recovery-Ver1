/**
 * @file CheckDaysOffFor5JSecondRuleParam.h
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
#include "CheckDaysOffFor5JSecondRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckDaysOffFor5JSecondRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::UNAVAILABLE_DAYS): {
				_unavailableDays = substr;
				if (substr != RuleParamConstant::ALL) {
					if (substr.find("-") != string::npos) {
						_unavailableDaysStart = stoi(substr.substr(0, substr.find("-")));
						_unavailableDaysEnd = stoi(substr.substr(substr.find("-") + 1));
					}
					else {
						_unavailableDaysStart = stoi(substr);
						_unavailableDaysEnd = _unavailableDaysStart + 1;
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DAYS_OFF): {
				if (substr != RuleParamConstant::ALL) {
					_minDaysOff = atoi(substr.c_str());
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckDaysOffFor5JSecondRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	_rowNum = dbRule.rowNum;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "UNAVAILABLE DAYS") {
			_unavailableDays = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_unavailableDaysStart = stoi(headeValue.substr(0, headeValue.find("-")));
					_unavailableDaysEnd = stoi(headeValue.substr(headeValue.find("-") + 1));
				}
				else {
					_unavailableDaysStart = stoi(headeValue);
					_unavailableDaysEnd = _unavailableDaysStart + 1;
				}
			}
		}
		else if (header == "MIN DAYS OFF") {
			if (headeValue != RuleParamConstant::ALL) {
				_minDaysOff = atoi(headeValue.c_str());
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckDaysOffFor5JSecondRuleParam::MatchAlDays(const int alDay) const {
	if (_unavailableDays.empty() || _unavailableDays == "*")
		return false;

	return _unavailableDaysStart <= alDay && _unavailableDaysEnd > alDay;
}

int CheckDaysOffFor5JSecondRuleParam::GetMinDaysOffByUnavailableDays(const int unavailableDays) const {
	if (!_unavailableDays.empty() && _unavailableDays != "*") {
		if (unavailableDays >= _unavailableDaysStart && unavailableDays < _unavailableDaysEnd)
			return _minDaysOff;
	}

	return 0;
}
