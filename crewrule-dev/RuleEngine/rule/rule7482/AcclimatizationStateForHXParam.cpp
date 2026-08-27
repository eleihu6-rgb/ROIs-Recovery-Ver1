/**
 * @file AcclimatizationStateForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AcclimatizationStateForHXParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void AcclimatizationStateForHXParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::TZ_DIFF): {
				_timezoneDiff = substr;

				vector<string> splitstrs;
				split(_timezoneDiff.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RETURN_TO_BASE_DURATION_RANGE): {
				_returnDurationRange = substr;

				vector<string> splitstrs;
				split(_returnDurationRange.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_returnDurationRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_returnDurationRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_STATE):
				_acclimatizationState = strToUpper(substr);
				break;
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void AcclimatizationStateForHXParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//TZ Diff,Return to Base Duration Range,ACC State
		if (header == "TZ DIFF") {
			_timezoneDiff = headeValue;

			vector<string> splitstrs;
			split(_timezoneDiff.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "RETURN TO BASE DURATION RANGE") {
			_returnDurationRange = headeValue;

			vector<string> splitstrs;
			split(_returnDurationRange.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_returnDurationRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_returnDurationRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "ACC STATE") {
			_acclimatizationState = strToUpper(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否匹配时区差
bool AcclimatizationStateForHXParam::MatchTimezoneDiff(const int tzDiffMinutes) const {
	return tzDiffMinutes >= _timezoneDiffMinutesLower && tzDiffMinutes <= _timezoneDiffMinutesUpper;
}

//Pairing从出发到返回基地时长范围（分钟数）
bool AcclimatizationStateForHXParam::MatchReturnToBaseDurationRange(const int pairingDurationMinutes) const {
	if (_returnDurationRange.empty() || _returnDurationRange == RuleParamConstant::ALL) {
		return true;
	}
	return pairingDurationMinutes >= _returnDurationRangeMinutesLower && pairingDurationMinutes <= _returnDurationRangeMinutesUpper;
}