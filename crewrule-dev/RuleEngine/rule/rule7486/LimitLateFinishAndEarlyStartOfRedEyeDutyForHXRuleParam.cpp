/**
 * @file LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-26
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACC_STATE): {
				_accState = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				_assignmentGroups = substr;
				_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				_assignments = substr;
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DAYS): {
				_strConsecutiveDays = substr;
				_consecutiveDays = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::ALLOWED_LNP_CONSECUTIVE_TIMES): {
				_strLNPConsecutiveTimes = substr;
				_lnpConsecutiveTimesLower = atoi(substr.c_str());
				_lnpConsecutiveTimesUpper = _lnpConsecutiveTimesLower;
				break;
			}
			case enum_to_underlying(ParamLocation::LNP_TIMES_RANGE): {
				_strLNPTimesRange = substr;
				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_lnpTimesRangeLower = atoi(splitstrs[0].c_str());
					_lnpTimesRangeUpper = atoi(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PRE_MIN_REST): {
				_strPrevMinRest = substr;
				_prevMinRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::PRE_LOCALNIGHT_TIMES): {
				_strPrevMinLocalNightNums = substr;
				_prevMinLocalNightNums = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::POST_MIN_REST): {
				_strPostMinRest = substr;
				_postMinRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::POST_LOCALNIGHT_TIMES): {
				_strPostMinLocalNightNums = substr;
				_postMinLocalNightNums = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::EVERY_DUTY_MAX_FDP): {
				_strMaxFDPOfDutyRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_maxFDPOfDutyRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_maxFDPOfDutyRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::EXCEPTION_CODES): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _exceptionCodes);
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

void LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,ACC State,Consecutive Days,Allowed LNP Consecutive Times,LNP Times Range,Pre Min Rest,Pre LocalNight Times,Post Min Rest,Post LocalNight Times,Every Duty Max FDP Range,Exception Codes
		if (header == "BASES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ACC STATE") {
			_accState = headeValue;
		}
		else if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			_assignments = headeValue;
			_assignmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CONSECUTIVE DAYS") {
			_strConsecutiveDays = headeValue;
			_consecutiveDays = atoi(headeValue.c_str());
		}
		else if (header == "ALLOWED LNP CONSECUTIVE TIMES") {
			_strLNPConsecutiveTimes = headeValue;
			_lnpConsecutiveTimesLower = atoi(headeValue.c_str());
			_lnpConsecutiveTimesUpper = _lnpConsecutiveTimesLower;
		}
		else if (header == "LNP TIMES RANGE") {
			_strLNPTimesRange = headeValue;
			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_lnpTimesRangeLower = atoi(splitstrs[0].c_str());
				_lnpTimesRangeUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "PRE MIN REST") {
			_strPrevMinRest = headeValue;
			_prevMinRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "PRE LOCALNIGHT TIMES") {
			_strPrevMinLocalNightNums = headeValue;
			_prevMinLocalNightNums = atoi(headeValue.c_str());
		}
		else if (header == "POST MIN REST") {
			_strPostMinRest = headeValue;
			_postMinRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "POST LOCALNIGHT TIMES") {
			_strPostMinLocalNightNums = headeValue;
			_postMinLocalNightNums = atoi(headeValue.c_str());
		}
		else if (header == "EVERY DUTY MAX FDP RANGE") {
			_strMaxFDPOfDutyRange = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_maxFDPOfDutyRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_maxFDPOfDutyRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "EXCEPTION CODES") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _exceptionCodes);
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::MatchParam(const Activity* activity) const {
	if (!MatchAccState(activity)) {
		return false;
	}

	return true;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::MatchAccState(const Activity* activity) const {
	if (typeid(*activity) != typeid(Duty) || _accState.empty() || _accState == RuleParamConstant::IGNORED) {
		return true;
	}
	Duty* duty = (Duty*)activity;
	return duty->getAcclimatisedState() == this->_accState;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckMaxFDPOfDuty(const Activity* activity) const {
	if (typeid(*activity) != typeid(Duty) || _strMaxFDPOfDutyRange.empty() || _strMaxFDPOfDutyRange == RuleParamConstant::IGNORED) {
		return true;
	}
	Duty* duty = (Duty*)activity;
	int actFDP = duty->getActualFDP();
	return actFDP >= _maxFDPOfDutyRangeMinutesLower && actFDP <= _maxFDPOfDutyRangeMinutesUpper;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPrevMinRest(const int actRestMinutes) const {
	if (_strPrevMinRest.empty() || _strPrevMinRest == RuleParamConstant::IGNORED) {
		return true;
	}
	return actRestMinutes >= _prevMinRestMinutes;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPrevMinLocalNightNums(const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const {
	if (_strPrevMinLocalNightNums.empty() || _strPrevMinLocalNightNums == RuleParamConstant::IGNORED) {
		return true;
	}
	int actLocalNightNum = DutyUtils::GetLocalNightNums(actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
	return actLocalNightNum >= _prevMinLocalNightNums;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPostMinRest(const int actRestMinutes) const {
	if (_strPostMinRest.empty() || _strPostMinRest == RuleParamConstant::IGNORED) {
		return true;
	}
	return actRestMinutes >= _postMinRestMinutes;
}

bool LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPostMinLocalNightNums(const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const {
	if (_strPostMinLocalNightNums.empty() || _strPostMinLocalNightNums == RuleParamConstant::IGNORED) {
		return true;
	}
	int actLocalNightNum = DutyUtils::GetLocalNightNums(actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes);
	return actLocalNightNum >= _postMinLocalNightNums;
}

//检查是否满足红眼任务前面的休息要求
int LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPrevRest(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const {
	int warnCode = (int)WarnCode::NO_WARN;

	if (!CheckPrevMinRest(actRestMinutes)) {
		warnCode = warnCode | (int)WarnCode::PREV_MIN_REST;
	}

	if (!CheckPrevMinLocalNightNums(actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes)) {
		warnCode = warnCode | (int)WarnCode::PREV_MIN_LOCALNIGHT;
	}
	return warnCode;
}

//检查是否满足红眼任务后面的休息要求
int LimitLateFinishAndEarlyStartOfRedEyeDutyForHXRuleParam::CheckPostRest(const int actRestMinutes, const time_t actRestStartTimeUtc, const time_t actRestEndTimeUtc, const int offsetTZMinutes) const {
	int warnCode = (int)WarnCode::NO_WARN;

	if (!CheckPostMinRest(actRestMinutes)) {
		warnCode = warnCode | (int)WarnCode::POST_MIN_REST;
	}

	if (!CheckPostMinLocalNightNums(actRestStartTimeUtc, actRestEndTimeUtc, offsetTZMinutes)) {
		warnCode = warnCode | (int)WarnCode::POST_MIN_LOCALNIGHT;
	}
	return warnCode;
}