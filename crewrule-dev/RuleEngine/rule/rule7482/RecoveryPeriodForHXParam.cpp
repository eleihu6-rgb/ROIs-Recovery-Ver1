/**
 * @file RecoveryPeriodForHXParam.h
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
#include "RecoveryPeriodForHXParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void RecoveryPeriodForHXParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::TZ_DIFF): {
				_timezoneDiff = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_CYCLE_IN_UNACCLIMATIZED_STATE): {
				_dutyCycleInUnaccState = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dutyCycleInUnaccStateMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dutyCycleInUnaccStateMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_RECOVERY_LOCATION_AT_BASE): {
				_isRecoveryLocationBase = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::TZ_DIFF_BETWEEN_RECOVERY_LOCATION_AND_BASE): {
				_tzDiffBetweenRecoveryLocAndBase = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_tzDiffBetweenRecoveryLocAndBaseMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_tzDiffBetweenRecoveryLocAndBaseMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DO): {
				_minDO = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_CONSECUTIVE_LOCAL_NIGHT_TIMES): {
				_minConsecutiveLocalNightTimes = (substr.empty() || substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_STATE): {
				_acclimatizationState = strToUpper(substr);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void RecoveryPeriodForHXParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//TZ Diff,Duty Cycle in Unacclimatized State,is Recovery Location at Base(Y/N),TZ Diff Between Recovery Location and Base,Min DO,Min Consecutive Local Night Times
		if (header == "TZ DIFF") {
			_timezoneDiff = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "DUTY CYCLE IN UNACCLIMATIZED STATE") {
			_dutyCycleInUnaccState = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_dutyCycleInUnaccStateMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_dutyCycleInUnaccStateMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "IS RECOVERY LOCATION AT BASE(Y/N)") {
			_isRecoveryLocationBase = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "TZ DIFF BETWEEN RECOVERY LOCATION AND BASE") {
			_tzDiffBetweenRecoveryLocAndBase = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_tzDiffBetweenRecoveryLocAndBaseMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_tzDiffBetweenRecoveryLocAndBaseMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN DO") {
			_minDO = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
		}
		else if (header == "MIN CONSECUTIVE LOCAL NIGHT TIMES") {
			_minConsecutiveLocalNightTimes = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
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
bool RecoveryPeriodForHXParam::MatchTimezoneDiff(const int tzDiffMinutes) const {
	if (_timezoneDiff.empty() || _timezoneDiff == RuleParamConstant::ALL) {
		return true;
	}
	return tzDiffMinutes >= _timezoneDiffMinutesLower && tzDiffMinutes <= _timezoneDiffMinutesUpper;
}

//Pairing从出发到返回基地时长范围（分钟数）
bool RecoveryPeriodForHXParam::MatchDutyCycleInUnacclimatizedState(const int dutyCycleInUnacclimatizedState) const {
	if (_dutyCycleInUnaccState.empty() || _dutyCycleInUnaccState == RuleParamConstant::ALL) {
		return true;
	}
	return dutyCycleInUnacclimatizedState >= _dutyCycleInUnaccStateMinutesLower && dutyCycleInUnacclimatizedState <= _dutyCycleInUnaccStateMinutesUpper;
}

bool RecoveryPeriodForHXParam::IsRecoveryLocationBase(const Duty* currDuty, const string& pairingBase) const {
	if (_isRecoveryLocationBase == nullptr) {
		return true;
	}
	bool isBase = (currDuty->getArrStationRead() == pairingBase);
	return isBase == *_isRecoveryLocationBase;
}

bool RecoveryPeriodForHXParam::MatchTzDiffBetweenRecoveryLocAndBase(const int tzDiffMinutes) const {
	if (_tzDiffBetweenRecoveryLocAndBase.empty() || _tzDiffBetweenRecoveryLocAndBase == RuleParamConstant::ALL) {
		return true;
	}
    return tzDiffMinutes >= _tzDiffBetweenRecoveryLocAndBaseMinutesLower && tzDiffMinutes <= _tzDiffBetweenRecoveryLocAndBaseMinutesUpper;
}