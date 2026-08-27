/**
 * @file CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam.h
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
#include "CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENT_GROUPS): {
				_standbyAssignmentGroups = substr;
				_standbyAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _standbyAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_WITHIN_THE_PLANNED_STANDBY): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_flightWithinThePlannedStandby = substr;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CALL_OUT_TO_FLIGHT_GAP_RANGE): {
				_callOutToFlightGapRange = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					if (substr.find("-") != string::npos) {
						vector<string> splitstrs;
						split(substr.c_str(), '-', splitstrs);
						if (splitstrs.size() >= 2) {
							_callOutToFlightGapLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
							_callOutToFlightGapUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
						}
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_DURATION_FROM_STANDBY_TO_FLIGHT_DUTY_END): {
				_maxDurationFromStandbyToFlightDutyEnd = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					if (isHHmm(substr.c_str())) {
						_maxDurationFromStandbyToFlightDutyEndMinutes = TimeUtils::hhmmToMinutes(substr);
					}
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "STANDBY ASSIGNMENT GROUPS") {
			_standbyAssignmentGroups = headeValue;
			_standbyAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _standbyAssignments);
			}
		}
		else if (header == "FLIGHT WITHIN PLANNED STANDBY") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_flightWithinThePlannedStandby = headeValue;
			}
		}
		else if (header == "CALL OUT TO FLIGHT GAP RANGE") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_callOutToFlightGapRange = headeValue;
				if (headeValue.find("-") != string::npos) {
					vector<string> splitstrs;
					split(headeValue.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_callOutToFlightGapLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_callOutToFlightGapUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
			}
		}
		else if (header == "MAX DURATION FROM STANDBY TO FLIGHT DUTY END") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_maxDurationFromStandbyToFlightDutyEnd = headeValue;
				if (isHHmm(headeValue.c_str())) {
					_maxDurationFromStandbyToFlightDutyEndMinutes = TimeUtils::hhmmToMinutes(headeValue);
				}
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::MatchStandbyAssignmentGroups(const ROSTER* roster) const {
	if (_standbyAssignmentGroups.empty() || _standbyAssignmentGroups == RuleParamConstant::ALL) {
		return true;
	}

	return roster != nullptr && _standbyAssignmentGroupsMatch.Match(*roster);
}

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::MatchStandbyAssignments(const string assignment) const {
	if (_standbyAssignments.empty() || _standbyAssignments[0].empty() || _standbyAssignments[0] == "*")
		return true;

	return find(_standbyAssignments.begin(), _standbyAssignments.end(), assignment) != _standbyAssignments.end();
}

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::MatchFlightTimeInPlannedStandby(const ROSTER* roster, const ROSTER* nextRoster) const {
	if (_flightWithinThePlannedStandby.empty() || _flightWithinThePlannedStandby == RuleParamConstant::ALL)
		return true;

	if (!nextRoster || !nextRoster->pairing)
		return false;

	time_t standbyStartTime = roster->getStartTimeUtcSch();
	time_t standbyEndTime = roster->getRestStartUtcSch();
	
	const auto& segment = nextRoster->pairing->getFirstSegment();
	time_t flightTimeStart = segment->getStartTimeUtcAct();
	time_t flightTimeEnd = segment->getEndTimeUtcAct();

	if (_flightWithinThePlannedStandby == "Y" && flightTimeStart < standbyEndTime)
		return true;

	if (_flightWithinThePlannedStandby == "N" && flightTimeStart > standbyEndTime)
		return true;

	return false;
}

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::MatchCallOutToFlightGap(const ROSTER* roster, const ROSTER* nextRoster) const {
	if (_callOutToFlightGapRange.empty() || _callOutToFlightGapRange == RuleParamConstant::ALL)
		return true;

	if (!nextRoster || !nextRoster->pairing || roster->calloutUtc <= 0)
		return false;
	
	const auto& duty = nextRoster->pairing->getFirstDuty();
	time_t flightTimeStart = duty->getFirstBreif()->getStartTimeUtcAct();

	const auto& gap = flightTimeStart - roster->calloutUtc;

	return gap >= _callOutToFlightGapLower * 60 && gap <= _callOutToFlightGapUpper * 60;
}

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam::CheckMaxDurationFromStandbyToFlightDutyEnd(const ROSTER* roster, const ROSTER* nextRoster) const {
	if (_maxDurationFromStandbyToFlightDutyEnd.empty() || _maxDurationFromStandbyToFlightDutyEnd == RuleParamConstant::ALL)
		return true;

	if (!nextRoster && !nextRoster->pairing)
		return false;

	time_t standbyStart = roster->getStartTimeUtcAct();
	
	const auto& duty = nextRoster->pairing->getFirstDuty();
	time_t dutyEnd = duty->getEndTimeUtcAct();

	const auto& duration = dutyEnd - standbyStart;

	return duration <= _maxDurationFromStandbyToFlightDutyEndMinutes * 60;
}

