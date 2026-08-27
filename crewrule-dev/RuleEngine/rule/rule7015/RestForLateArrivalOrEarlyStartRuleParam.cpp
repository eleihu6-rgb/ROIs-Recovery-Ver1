/**
 * @file RestForLateArrivalOrEarlyStartRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "RestForLateArrivalOrEarlyStartRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void RestForLateArrivalOrEarlyStartRuleParam::ParseParam(const std::string &paramString) {
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

			case enum_to_underlying(ParamLocation::ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			case enum_to_underlying(ParamLocation::NEXT_ROSTER_ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _nextRosterAssignments);
				}
				break;
			case enum_to_underlying(ParamLocation::START_OR_END):
				_rosterStartOrEnd = substr;
				break;
			case enum_to_underlying(ParamLocation::LOCAL_START_TIME):
				_localStartTime = substr;
				_localStartTimeMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::LOCAL_END_TIME):
				_localEndTime = substr;
				_localEndTimeMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::MIN_GAP_BETWEEN_ROSTERS):
				_minGapBetweenRosters = substr;
				_minGapBetweenRostersMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::INCLUDING_REST_AT_BASE):
				 _isIncludingRestAtBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME):
				_nextRosterShouldNotBeforeTime = substr;
				_nextRosterShouldNotBeforeTimeMinutes = TimeUtils::hhmmToMinutes(substr);
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

void RestForLateArrivalOrEarlyStartRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Assignments,Next Roster Assignments,Start or End(S/E),Local Start Time,Local End Time,Min Gap Between Rosters,Including Rest At Base(Y/N),Next Roster Should Not Before Time
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "NEXT ROSTER ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _nextRosterAssignments);
			}
		}
		else if (header == "START OR END(S/E)") {
			_rosterStartOrEnd = headeValue;
		}
		else if (header == "LOCAL START TIME") {
			_localStartTime = headeValue;
			_localStartTimeMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "LOCAL END TIME") {
			_localEndTime = headeValue;
			_localEndTimeMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "MIN GAP BETWEEN ROSTERS") {
			_minGapBetweenRosters = headeValue;
			_minGapBetweenRostersMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "INCLUDING REST AT BASE(Y/N)") {
			_isIncludingRestAtBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "NEXT ROSTER SHOULD NOT BEFORE TIME") {
			_nextRosterShouldNotBeforeTime = headeValue;
			_nextRosterShouldNotBeforeTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool RestForLateArrivalOrEarlyStartRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

//匹配规则参数是否满足
bool RestForLateArrivalOrEarlyStartRuleParam::MatchParam(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	if (!MatchRosterTime(currRoster)) {
		return false;
	}

	if (!MatchAssignments(currRoster)) {
		return false;
	}

	if (!MatchNextRosterAssignments(nextRoster)) {
		return false;
	}
	return true;
}

bool RestForLateArrivalOrEarlyStartRuleParam::MatchRosterTime(const ROSTER* currRoster) const {
	if (this->_localStartTime == RuleParamConstant::IGNORED || this->_localEndTime == RuleParamConstant::IGNORED) {
		return true;
	}
	time_t rosterTimeLoc = this->_rosterStartOrEnd == "S" ? currRoster->getStartTimeLocAct() : currRoster->getRestStartLocAct();
	return TimeUtils::IsTimesInRange(rosterTimeLoc, this->_localStartTimeMinutes, this->_localEndTimeMinutes);
	
}

bool RestForLateArrivalOrEarlyStartRuleParam::MatchAssignments(const ROSTER* currRoster) const {
	if (_assignments.empty()) {
		return true;
	}
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), currRoster->qualifier);
	return iter != _assignments.cend();
}

bool RestForLateArrivalOrEarlyStartRuleParam::MatchNextRosterAssignments(const ROSTER* nextRoster) const {
	if (_nextRosterAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_nextRosterAssignments.cbegin(), _nextRosterAssignments.cend(), nextRoster->qualifier);
	return iter != _nextRosterAssignments.cend();
}

//检查是否满足参数
int RestForLateArrivalOrEarlyStartRuleParam::CheckParam(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	int warnCode = (int)WarnCode::NO_WARN;
	if (!CheckMinGapBetweenRosters(currRoster, nextRoster)) {
		warnCode = (int)WarnCode::MIN_GAP_BETWEEN_ROSTERS_WARN;
	}

	if (!CheckNextRosterShouldNotBeforeTime(currRoster, nextRoster)) {
		warnCode = warnCode | (int)WarnCode::NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME_WARN;
	}
	return warnCode;
}

//检查“Roster间最小间隔时间(分钟数)”
bool RestForLateArrivalOrEarlyStartRuleParam::CheckMinGapBetweenRosters(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	time_t startTime = currRoster->getRestStartUtcAct();  
	if ((this->_isIncludingRestAtBase != nullptr && !(*this->_isIncludingRestAtBase))) {
		//不包含基地的休息
		startTime = currRoster->getEndTimeUtcAct();
	}

	time_t endTime = nextRoster->getStartTimeUtcAct();
	int duration = static_cast<int>(endTime - startTime);
	return duration >= this->_minGapBetweenRostersMinutes * 60;
}

//检查“后一个Roster不能在第二天的X前开始”
bool RestForLateArrivalOrEarlyStartRuleParam::CheckNextRosterShouldNotBeforeTime(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	//Roster.getRestStartLocAct()时间为工作完成时间，Roster.getEndTimeUtcAct()包含Roster的休息时间，因此Roster的结束时间一般认为是：Roster.getRestStartLocAct()
	time_t today = TimeUtils::GetStartTimeOfDay(currRoster->getRestStartLocAct()); 
	time_t tomorrow = today + 24 * 60 * 60;
	time_t earlyStartTime = tomorrow + this->_nextRosterShouldNotBeforeTimeMinutes * 60;
	return earlyStartTime <= nextRoster->getStartTimeLocAct();
	
}