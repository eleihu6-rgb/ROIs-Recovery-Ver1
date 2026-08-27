/**
 * @file AdjustMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-27
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AdjustMinRestForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void AdjustMinRestForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::MIN_REST_RANGE): {
				_minRestRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_minRestRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_minRestRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::HOTEL_MIN_REST): {
				_hotelMinRest = substr;
				_hotelMinRestMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
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

void AdjustMinRestForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Min Rest Range,Hotel Min Rest
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;

		if (header == "MIN REST RANGE") {
			_minRestRange = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_minRestRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_minRestRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "HOTEL MIN REST") {
			_hotelMinRest = headerValue;
			_hotelMinRestMinutes = TimeUtils::hhmmToMinutes(headerValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headerValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool AdjustMinRestForHXRuleParam::MatchMinRestRange(const int minRest) const {
	if (_minRestRange.empty() || _minRestRange == RuleParamConstant::IGNORED) {
		return true;
	}
    return minRest >= _minRestRangeMinutesLower && minRest <= _minRestRangeMinutesUpper;
}
