/**
 * @file MinRestAtBaseForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/


#include <sstream>
#include <map>
#include <algorithm>

#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "MinRestAtBaseForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "TimezoneUtils.h"

using namespace std;

void MinRestAtBaseForTGRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PAIRING_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingAssignments);
				}
				break;
			}
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
			case enum_to_underlying(ParamLocation::PAIRING_DURATION): {
				_pairingDuration = substr;

				vector<string> splitstrs;
				split(_pairingDuration.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_pairingDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_pairingDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_DIRECTION_TRANSITION): {
				_isDirectionTransition = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_LOCAL_NIGHTS): {
				_minLocalNightNum = (substr == RuleParamConstant::ALL) ? 0 : atoi(substr.c_str());
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

void MinRestAtBaseForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Pairing Assignments,Pairing Duration,TZ Diff,E-W or W-E Transition(Y/N),Min Local Nights
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
		else if (header == "PAIRING ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingAssignments);
			}
		}
		else if (header == "PAIRING DURATION") {
			_pairingDuration = headeValue;

			vector<string> splitstrs;
			split(_pairingDuration.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_pairingDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_pairingDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "TZ DIFF") {
			_timezoneDiff = headeValue;

			vector<string> splitstrs;
			split(_timezoneDiff.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "E-W OR W-E TRANSITION(Y/N)") {
			_isDirectionTransition = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);

		}
		else if (header == "MIN LOCAL NIGHTS") {
			_minLocalNightNum = (headeValue == RuleParamConstant::ALL) ? 0 : atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MinRestAtBaseForTGRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

//判断Pairing是否满足任务类型
bool MinRestAtBaseForTGRuleParam::MatchPairingAssignments(const Pairing* pairing) const {
	if (_pairingAssignments.empty()) {
		return true;
	}
	string assignment = pairing->getQualifier();
	auto iter = std::find(_pairingAssignments.cbegin(), _pairingAssignments.cend(), assignment);
	return iter != _pairingAssignments.cend();
}

bool MinRestAtBaseForTGRuleParam::MatchPairingDuration(const Pairing* pairing) const {
	if (this->_pairingDuration.empty() || this->_pairingDuration == RuleParamConstant::ALL) {
		return true;
	}

	time_t pairingStartUtc = pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
	time_t pairingEndUtc = pairing->getLastDuty()->getLastDebrief()->getEndTimeUtcAct();
	int pairingDuration = static_cast<int>(pairingEndUtc - pairingStartUtc) / 60;
	return (pairingDuration >= this->_pairingDurationMinutesLower && pairingDuration < this->_pairingDurationMinutesUpper);
}

//判断Pairing HomeBase与Layover地点时区差是否满足要求
bool MinRestAtBaseForTGRuleParam::MatchLayoverTzDiff(const Pairing* pairing, const int baseOffsetTZMinutes) const {
	int maxTzDiff = -1;
	for (auto& duty : pairing->getDutyVec()) {
		int arrOffsetTZMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duty, this->GetRule()->GetDataContext());
		int tzDiff = TimezoneUtils::abs(arrOffsetTZMinutes - baseOffsetTZMinutes);
		if (tzDiff > maxTzDiff) {
			maxTzDiff = tzDiff;
		}
	}
	return (maxTzDiff >= this->_timezoneDiffMinutesLower && maxTzDiff < this->_timezoneDiffMinutesUpper);
}

bool MinRestAtBaseForTGRuleParam::MatchDirectionTransition(const Pairing* prevPairing, const Pairing* nextPairing, const int baseOffsetTZMinutes) const {
	if (_isDirectionTransition == nullptr) {
		return true;
	}
	return *_isDirectionTransition.get() == IsDirectionTransition(prevPairing, nextPairing, baseOffsetTZMinutes);
}

/**
* 获得Pairing的飞行方向（东向或西向）以及时区差。
* 算法说明：基于home base时区差列表为： 2,4,8,-4,-2,0。先东最大时区8，先西最大时区abs(-4) 满足 Eastward-Westward or Westward-Eastward transition
* @param isEast：输出参数，true表示东向，false表示西向
* @param tzDiff：输出参数，时区差绝对值，单位为分钟
*/
inline static void GetDirectionAndTzDiff(bool& isEast, int& tzDiff, const Pairing* pairing, const int baseOffsetTZMinutes, const std::shared_ptr<CrewDataContext>& dbData) {
	auto segments = const_cast<Pairing*>(pairing)->getSegments();
	int maxEastwardTzDiff = INT_MIN;//向东最大时差（时差正数，正数越小时差越大)
	int maxWestwardTzDiff = INT_MAX; //向西最大时差（时差负数，负数越小时差越大)
	for (auto& segment : segments) {
		int arrOffsetTZMinutes = SegmentUtils::GetTimeZoneOffsetByArr(*segment, dbData);
		int tzDiff = arrOffsetTZMinutes - baseOffsetTZMinutes;
		if (tzDiff >= 0) {
			if (tzDiff > maxEastwardTzDiff) {
				maxEastwardTzDiff = tzDiff;//向东取最大值
			}
		}
		else {
			if (tzDiff < maxWestwardTzDiff) {
				maxWestwardTzDiff = tzDiff;//向东取最小值
			}
		}
	}
	if (maxWestwardTzDiff != INT_MAX) {
		maxWestwardTzDiff = TimezoneUtils::abs(maxWestwardTzDiff);
	}

	if (maxEastwardTzDiff > maxWestwardTzDiff || maxWestwardTzDiff == INT_MAX) {
		isEast = true;
		tzDiff = maxEastwardTzDiff;
	}
	else {
		isEast = false;
		tzDiff = maxWestwardTzDiff;
	}
}

bool MinRestAtBaseForTGRuleParam::IsDirectionTransition(const Pairing* currPairing, const Pairing* nextPairing, const int baseOffsetTZMinutes) const {
	if (currPairing == nullptr || nextPairing == nullptr) {
		return false;
	}
	//Eastward-Westward or Westward-Eastward transition: 从Home base出发，一个方向最远至少有4小时时差，返回方向至少有4小时时差。
	bool isEastOfCurr = false, isEastOfNext = false;
	int tzDiffOfCurr = -1, tzDiffOfNext = -1;
	GetDirectionAndTzDiff(isEastOfCurr, tzDiffOfCurr, currPairing, baseOffsetTZMinutes, this->GetRule()->GetDataContext());
	GetDirectionAndTzDiff(isEastOfNext, tzDiffOfNext, nextPairing, baseOffsetTZMinutes, this->GetRule()->GetDataContext());
	if (isEastOfCurr == isEastOfNext) {
		return false;
	}
	return (tzDiffOfCurr >= 4 * 60 && tzDiffOfNext >= 4 * 60) || (tzDiffOfNext >= 4 * 60 && tzDiffOfCurr >= 4 * 60);
}

bool MinRestAtBaseForTGRuleParam::MatchParam(const Pairing* currPairing, const Pairing* nextPairing, const int baseOffsetTZMinutes) const {

	if (!MatchPairingAssignments(currPairing)) {
		return false;
	}

	if (!MatchPairingDuration(currPairing)) {
		return false;
	}

	if (!MatchLayoverTzDiff(currPairing, baseOffsetTZMinutes)) {
		return false;
	}

	if (!MatchDirectionTransition(currPairing, nextPairing, baseOffsetTZMinutes)) {
		return false;
	}
	return true;
}