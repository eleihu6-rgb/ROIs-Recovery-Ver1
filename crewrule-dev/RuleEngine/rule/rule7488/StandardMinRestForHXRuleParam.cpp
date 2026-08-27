/**
 * @file StandardMinRestForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "StandardMinRestForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void StandardMinRestForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::DP_RANGE): {
				_dpRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dpRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dpRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TZ_DIFF_RANGE): {
				_tzDiffRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_tzDiffRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_tzDiffRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_STATE): {
				_accState = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::UNACC_AWAY_FROM_BASE_DURATION): {
				_unaccAwayFromBaseDuration = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_unaccAwayFromBaseDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_unaccAwayFromBaseDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::COMPARE_WITH_PRE_DUTY_DP): {
				_isCompareWithDutyDP = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::STANDARD_MIN_REST): {
				_standardMinRest = substr;
				_standardMinRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::PHYSIOLOGICAL_REST): {
				_isPhysiologicalRest = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::PHYSIOLOGICAL_REST_TIME_ZONE): {
				_physiologicalRestTimeZone = strToUpper(substr);
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

void StandardMinRestForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//DP Range,TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;

		if (header == "DP RANGE" || header == "DP RANGES") {
			_dpRange = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_dpRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_dpRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "TZ DIFF RANGE") {
			_tzDiffRange = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_tzDiffRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_tzDiffRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "ACC STATE") {
			_accState = strToUpper(headerValue);
		}
		else if (header == "UNACC AWAY FROM BASE DURATION") {
			_unaccAwayFromBaseDuration = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_unaccAwayFromBaseDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_unaccAwayFromBaseDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "COMPARE WITH PRE DUTY DP(Y/N)") {
			_isCompareWithDutyDP = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headerValue == RuleParamConstant::YES);
		}
		else if (header == "STANDARD MIN REST") {
			_standardMinRest = headerValue;
			_standardMinRestMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else if (header == "PHYSIOLOGICAL REST(Y/N)") {
			_isPhysiologicalRest = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headerValue == RuleParamConstant::YES);
		}
		else if (header == "PHYSIOLOGICAL REST TIME ZONE" || header == "PHYSIOLOGICAL REST TIME ZONE(BASE/LOCAL)") {
			_physiologicalRestTimeZone = strToUpper(headerValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headerValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool StandardMinRestForHXRuleParam::MatchParam(const Duty* duty, const int maxTZDiffMinutes, const int unaccAwayFromBaseDurationOfDuty, const int dpInMinutes) const {
	if (!MatchDPRange(dpInMinutes)) {
		return false;
	}

	if (!MatchTzDiffRange(maxTZDiffMinutes)) {
		return false;
	}

	if (!MatchUnaccAwayFromBaseDuration(unaccAwayFromBaseDurationOfDuty)) {
		return false;
	}

	if (!MatchAccState(duty)) {
		return false;
	}

	return true;
}

bool StandardMinRestForHXRuleParam::MatchParam(const ROSTER* roster, const int maxTZDiffMinutes, const int unaccAwayFromBaseDurationOfDuty, const int dpInMinutes) const {
	if (!MatchDPRange(dpInMinutes)) {
		return false;
	}

	if (!MatchTzDiffRange(maxTZDiffMinutes)) {
		return false;
	}

	if (!MatchUnaccAwayFromBaseDuration(unaccAwayFromBaseDurationOfDuty)) {
		return false;
	}

	return true;
}

bool StandardMinRestForHXRuleParam::MatchDPRange(const int dpInMinutes) const {
	if (_dpRange.empty() || _dpRange == RuleParamConstant::IGNORED) {
		return true;
	}
	return dpInMinutes >= _dpRangeMinutesLower && dpInMinutes <= _dpRangeMinutesUpper;
}

bool StandardMinRestForHXRuleParam::MatchTzDiffRange(const int maxTZDiffMinutes) const {
	if (_tzDiffRange.empty() || _tzDiffRange == RuleParamConstant::IGNORED) {
		return true;
	}
    return maxTZDiffMinutes >= _tzDiffRangeMinutesLower && maxTZDiffMinutes <= _tzDiffRangeMinutesUpper;
}

bool StandardMinRestForHXRuleParam::MatchUnaccAwayFromBaseDuration(const int unaccAwayFromBaseDurationOfDuty) const {
	if (_unaccAwayFromBaseDuration.empty() || _unaccAwayFromBaseDuration == RuleParamConstant::IGNORED) {
		return true;
	}
	return unaccAwayFromBaseDurationOfDuty >= _unaccAwayFromBaseDurationMinutesLower && unaccAwayFromBaseDurationOfDuty <= _unaccAwayFromBaseDurationMinutesUpper;
}

bool StandardMinRestForHXRuleParam::MatchAccState(const Duty* duty) const {
	if (_accState.empty() || _accState == RuleParamConstant::IGNORED) {
		return true;
	}
	return _accState == duty->getAcclimatisedStateForRestStart();
}