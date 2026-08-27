/**
 * @file CalculationOfOffDutyPeriodRuleParam.h
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
#include "CalculationOfOffDutyPeriodRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"

using namespace std;

void CalculationOfOffDutyPeriodRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				split(substr, '|', _bases);
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				split(substr, '|', _ranks);
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				split(substr, '|', _fleets);
				break;
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_TZ_DIFF): {
				_dutyTzDiff = substr;

				vector<string> splitstrs;
				split(_dutyTzDiff.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dutyTzDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dutyTzDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SECTOR_BLH_RANGES): {
				_sectorBlhRanges = substr;

				vector<string> splitstrs;
				split(_sectorBlhRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_sectorBlhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_sectorBlhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ENCROACH_TIME_RANGES): {
				_encroachTimeRanges = substr;

				vector<string> splitstrs;
				split(_encroachTimeRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_encroachTimeRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_encroachTimeRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_HOME_BASE):
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::ACCLIMATIZED_STATE):
				_acclimatizedState = substr;
				break;
			case enum_to_underlying(ParamLocation::DO_ASSIGNMENT_GROUPS):
				split(substr, '|', _dayOffAssignmentGroups);
				break;
			case enum_to_underlying(ParamLocation::UTILIZE_POST_DUTY_REST):
				_isUtilizePostDutyRest = (substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::COUNT_BLANK_DAY):
				_isCountBlankDay = (substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::ULTILIZE_LAYOVER):
				_isUltilizeLayover = (substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::BENCHMARK):
				_benchmark = (substr.empty() || substr == "*") ? "FDP" : "DP";
				break;
			case enum_to_underlying(ParamLocation::FDP_THRESHOLD): {//废弃
				_periodThredhold = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_periodThredhold.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_periodThredholdMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_periodThredholdMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PERIOD_THRESHOLD): {
				_periodThredhold = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_periodThredhold.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_periodThredholdMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_periodThredholdMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REST_TIME):
				_restTime = substr;
				_restTimeMinutes = TimeUtils::hhmmToMinutes(_restTime);
				break;
			//case enum_to_underlying(ParamLocation::FDP_EXCEEDED_HOURS):
			//	_fdpExceededHours = substr;
			//	_fdpExceededMinutes = TimeUtils::hhmmToMinutes(_fdpExceededHours) * 60;
			//	break;
			case enum_to_underlying(ParamLocation::FDP_TIMES):
				_fdpTimes = atof(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::DIRECTION):
				_direction = substr;
				break;
			case enum_to_underlying(ParamLocation::DISPLACEMENT_ADJUSTMENT_REFERENCE_TIME):
				_displaceAdjustReferTime = substr;
				_displaceAdjustReferTimeMinutes = (_displaceAdjustReferTime == RuleParamConstant::ALL) ? nullptr : 
					std::make_unique<int>(TimeUtils::hhmmToMinutes(_displaceAdjustReferTime));
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

void CalculationOfOffDutyPeriodRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases, Ranks, Fleets, Duty Assignments, Duty TZ Diff, Sector BLH Ranges, Encroach Time, Is Home Base, Acclimatized State, Benchmark, Period Thredhold, Rest Time, FDP Exceeded Hours, FDP Times, Displacement Adjustment Reference Time

		if (header == "BASES")
			split(headeValue, '|', _bases);
		else if (header == "RANKS")
			split(headeValue, '|', _ranks);
		else if (header == "FLEETS")
			split(headeValue, '|', _fleets);
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "DUTY TZ DIFF") {
			_dutyTzDiff = headeValue;

			vector<string> splitstrs;
			split(_dutyTzDiff.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_dutyTzDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_dutyTzDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "SECTOR BLH RANGES") {
			_sectorBlhRanges = headeValue;

			vector<string> splitstrs;
			split(_sectorBlhRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_sectorBlhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_sectorBlhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "ENCROACH TIME") {
			_encroachTimeRanges = headeValue;

			vector<string> splitstrs;
			split(_encroachTimeRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_encroachTimeRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_encroachTimeRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "IS HOME BASE")
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		else if (header == "ACCLIMATIZED STATE")
			_acclimatizedState = headeValue;
		else if (header == "DO ASSIGNMENT GROUPS")
			split(headeValue, '|', _dayOffAssignmentGroups);
		else if (header == "UTILIZE POST DUTY REST")
			_isUtilizePostDutyRest = (headeValue == RuleParamConstant::YES);
		else if (header == "COUNT BLANK DAY")
			_isCountBlankDay = (headeValue == RuleParamConstant::YES);
		else if (header == "ULTILIZE LAYOVER")
			_isUltilizeLayover = (headeValue == RuleParamConstant::YES);
		else if (header == "BENCHMARK")
				_benchmark = (headeValue.empty() || headeValue == "*") ? "FDP" : "DP";
		else if (header == "FDP THRESHOLD") {//废弃
			_periodThredhold = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_periodThredhold.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_periodThredholdMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_periodThredholdMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "PERIOD THRESHOLD") {
			_periodThredhold = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_periodThredhold.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_periodThredholdMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_periodThredholdMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "REST TIME") {
			_restTime = headeValue;
			_restTimeMinutes = TimeUtils::hhmmToMinutes(_restTime);
		}
		//else if (header == "FDP EXCEEDED HOURS") {
		//	_fdpExceededHours = headeValue;
		//	_fdpExceededMinutes = TimeUtils::hhmmToMinutes(_fdpExceededHours) * 60;
		//}
		else if (header == "FDP TIMES")
			_fdpTimes = atof(headeValue.c_str());
		else if (header == "DIRECTION")
			_direction = headeValue;
		else if (header == "DISPLACEMENT ADJUSTMENT REFERENCE TIME") {
			_displaceAdjustReferTime = headeValue;
			_displaceAdjustReferTimeMinutes = (_displaceAdjustReferTime == RuleParamConstant::ALL) ? nullptr 
				: std::make_unique<int>(TimeUtils::hhmmToMinutes(_displaceAdjustReferTime));
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculationOfOffDutyPeriodRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> teams;
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CalculationOfOffDutyPeriodRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

bool CalculationOfOffDutyPeriodRuleParam::MatchDutyTzDiff(const Duty& duty) const {
	if (_dutyTzDiff == RuleParamConstant::IGNORED) {
		return true;
	}
	int timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(duty, this->GetRule()->GetDataContext()));
	return timeZoneDiff >= this->_dutyTzDiffMinutesLower && timeZoneDiff <= this->_dutyTzDiffMinutesUpper;

}

//判断Sector飞时
bool CalculationOfOffDutyPeriodRuleParam::MatchSectorBlhRanges(const Duty& duty) const {
	if (_sectorBlhRanges == RuleParamConstant::IGNORED) {
		return true;
	}
	for (auto& segment : duty.getSegmentsRead()) {
		int blk = (int)segment->getBlkMinutes();
		if (segment->getIsOperating() && blk >= _sectorBlhRangesMinutesLower && blk < _sectorBlhRangesMinutesUpper) {
			if (MatchEncroachTimeRanges(segment)) {
				return true;
			}
		}
	}
	return false;
}

//判断Segment飞行时间段侵犯的时间段
bool CalculationOfOffDutyPeriodRuleParam::MatchEncroachTimeRanges(const Segment* segment) const {
	if (_encroachTimeRanges == RuleParamConstant::IGNORED) {
		return true;
	}
	int offsetTZMinutes = static_cast<int>(segment->getStartTimeLocAct() - segment->getStartTimeUtcAct()) / 60;
	time_t startTime = segment->getStartTimeLocAct();
	time_t endTime = segment->getEndTimeUtcAct() + offsetTZMinutes * 60; //使用起飞机场时区
	return TimeUtils::IsTimesCovered(startTime, endTime, _encroachTimeRangesMinutesLower, _encroachTimeRangesMinutesUpper);
}

//判断是否在基地
bool CalculationOfOffDutyPeriodRuleParam::MatchHomeBase(const Duty& duty, const std::string& base, const SharedPtr<CrewDataContext>& dbData) const {
	std::string pairingBase;
	if (!base.empty()) { 
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

//判断是否在适应期
bool CalculationOfOffDutyPeriodRuleParam::MatchAcclimatizedState(const Duty* currDuty) const {
	if (currDuty == nullptr) {
		//Min ODP判断适应状态，实际是判断nextDuty的适应状态，若nextDuty为null，则认为适应状态为“适应(A)”
		return (_acclimatizedState == RuleParamConstant::ALL) || (AcclimatizationState::ACCLIMATIZED == _acclimatizedState);
	}
	return (_acclimatizedState == RuleParamConstant::ALL) || (currDuty->getAcclimatisedStateForRestStart()  == _acclimatizedState) ;
}

//判断是否匹配位移方向
bool CalculationOfOffDutyPeriodRuleParam::MatchDirection(const string& direction) const {
	return (_direction == RuleParamConstant::ALL) || (direction == _direction);
}

//判断是否匹配FDP阈值
bool CalculationOfOffDutyPeriodRuleParam::MatchFDPThredhold(const Duty& duty, const int dutyFdpMinutes) const {
	int duration = dutyFdpMinutes;//默认基于FDP计算
	if (_benchmark == "DP") {
		duration = duty.getDPInSecs() / 60;
	}
	return (duration >= _periodThredholdMinutesLower) && (duration < _periodThredholdMinutesUpper);
}

//bool CalculationOfOffDutyPeriodRuleParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
//
//    // The checking sequence can be reordered to better speed up the process
//    if (isAugment != _isAugment) return false;
//
//    if (_composition.front() != InputRuleParamDefine::WildcardChar && composition != _composition) return false;
//
//    if (reportTime < _reportTimeLower || reportTime > _reportTimeUpper) return false;
//
//    return true;
//}


