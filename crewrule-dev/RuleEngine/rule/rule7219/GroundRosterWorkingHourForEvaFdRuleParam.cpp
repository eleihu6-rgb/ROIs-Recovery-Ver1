/**
 * @file GroundRosterWorkingHourForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "GroundRosterWorkingHourForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void GroundRosterWorkingHourForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::ROSTER_ASSIGNMENT_GROUPS): {
				_rosterAssignmentGroups = substr;
				_rosterAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ROSTER_ASSIGNMENTS): {
				_rosterAssignments = substr;
				_rosterAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOLLOWING_PAIRING): {
				_isFollowingPairing = substr;
				_isFollowingPairingMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODE): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_HOUR): {
				_whExpression = substr;
				if (isHHmm(substr.c_str())) {
					_whExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				}
				break;
			}
			//case enum_to_underlying(ParamLocation::SPLIT_METHOD): {
			//	_splitMethod = substr;
			//	break;
			//}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void GroundRosterWorkingHourForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Roster Assignment Groups,Roster Assignments,Course Code,Working Hour
		if (header == "ROSTER ASSIGNMENT GROUPS") {
			_rosterAssignmentGroups = headeValue;
			_rosterAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ROSTER ASSIGNMENTS") {
			_rosterAssignments = headeValue;
			_rosterAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FOLLOWING PAIRING(Y/N)") {
			_isFollowingPairing = headeValue;
			_isFollowingPairingMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "COURSE CODE") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "WORKING HOUR") {
			_whExpression = headeValue;
			if (isHHmm(headeValue.c_str())) {
				_whExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
			}
		}
		//else if (header == "SPLIT METHOD") {
		//	_splitMethod = headeValue;
		//}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

bool GroundRosterWorkingHourForEvaFdRuleParam::MatchFollowingPairing(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	if (nextRoster == nullptr || nextRoster->pairing == nullptr) {
		return true;
	}

	bool isOverlap = false;
	if (currRoster->getRestStartUtcAct() >= nextRoster->getStartTimeUtcAct()
		&& currRoster->getStartTimeUtcAct() < nextRoster->getStartTimeUtcAct()) {
		isOverlap = true;
	}
	return _isFollowingPairingMatch.Match(isOverlap);
}

//匹配参数
bool GroundRosterWorkingHourForEvaFdRuleParam::MatchParam(const ROSTER* currRoster, const ROSTER* nextRoster) const {

	if (!_rosterAssignmentGroupsMatch.Match(*currRoster)) {
		return false;
	}

	if (!_rosterAssignmentsMatch.Match(*currRoster)) {
		return false;
	}

	if (!MatchFollowingPairing(currRoster, nextRoster)) {
		return false;
	}

	vector<long long> flightIds;
	if (!_courseCodeMatch.Match(*currRoster, flightIds)) {
		return false;
	}
	return true;
}
