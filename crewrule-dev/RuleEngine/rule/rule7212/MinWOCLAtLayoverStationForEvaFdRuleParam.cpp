/**
 * @file MinWOCLAtLayoverStationForEvaFdRuleParam.h
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
#include "MinWOCLAtLayoverStationForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

void MinWOCLAtLayoverStationForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::LAST_DUTY_COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _lastDutyCompositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SECTOR_BLH_RANGES): {
				_segmentBlhRanges = substr;

				vector<string> splitstrs;
				split(_segmentBlhRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_segmentBlhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_segmentBlhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PAIRING_END_STATIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingEndAirports);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::LAYOVER_MIN_REST): {
				_strMinRestAtLayover = substr;
				_minRestAtLayoverMinutes = (substr == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SLEEP_CYCLE_START): {
				_sleepCycleStart = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SLEEP_CYCLE_END): {
				_sleepCycleEnd = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_SLEEP_CYCLES): {
				_strMinSleepCycles = substr;
				_minSleepCycles = (substr == RuleParamConstant::ALL) ? -1 : stoi(substr);
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

void MinWOCLAtLayoverStationForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Last Duty Compositions,Segment Assignments,Sector BLH Ranges,Pairing End Stations,Layover Min Rest,Min WOCL Number
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
		else if (header == "LAST DUTY COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _lastDutyCompositions);
			}
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "SECTOR BLH RANGES") {
			_segmentBlhRanges = headeValue;

			vector<string> splitstrs;
			split(_segmentBlhRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_segmentBlhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_segmentBlhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "PAIRING END STATIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingEndAirports);
			}
		}
		else if (header == "LAYOVER MIN REST") {
			_strMinRestAtLayover = headeValue;
			_minRestAtLayoverMinutes = (headeValue == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SLEEP CYCLE START") {
			_sleepCycleStart = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SLEEP CYCLE END") {
			_sleepCycleEnd = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN SLEEP CYCLES") {
			_strMinSleepCycles = headeValue;
			_minSleepCycles = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//是否忽略"Layover最小休息时长（分钟数）"参数，返回true-忽略，false-未忽略
bool MinWOCLAtLayoverStationForEvaFdRuleParam::ignoreMinRestAtLayover() const {
	return _strMinRestAtLayover.empty() || _strMinRestAtLayover == RuleParamConstant::ALL;
}

//是否忽略"Layover最小WOCL次数"参数，返回true-忽略，false-未忽略
bool MinWOCLAtLayoverStationForEvaFdRuleParam::ignoreMinWOCLAtLayover() const {
	return _strMinSleepCycles.empty() || _strMinSleepCycles == RuleParamConstant::ALL;
}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchNextDutyComposition(const Duty* nextDuty) const {
	if (_lastDutyCompositions.empty() || nextDuty == nullptr) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	
	string compName = nextDuty->getCompositionName();
	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel) {
		compName = DutyUtils::GetCompositionByDutyFor3(nextDuty, this->GetRule()->GetDataContext());
		const_cast<Duty*>(nextDuty)->setCompositionName(compName);
	}

	auto iter = std::find(_lastDutyCompositions.cbegin(), _lastDutyCompositions.cend(), compName);
	return iter != _lastDutyCompositions.cend();
}

//判断Segment是否满足任务类型（计算BLH的任务类型）
bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchSegmentAssignments(const Segment& segment) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	string assignment = segment.getAssignment();
	auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	return iter != _segmentAssignments.cend();
}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchMaxSegmentFlightTime(const Duty* currDuty) const {
	if (_segmentBlhRanges == RuleParamConstant::ALL) {
		return true;
	}

	for (auto& segment : currDuty->getSegments()) {
		if (MatchSegmentAssignments(*segment)) {
			int blh = SegmentUtils::GetBlkMinutes(*segment);
			if (blh >= _segmentBlhRangesMinutesLower && blh < _segmentBlhRangesMinutesUpper) {
				return true;
			}
		}
	}
	return false;
}

//判断是否在基地
bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchPairingEndAirports(const Pairing& pairing) const {
	if (_pairingEndAirports.empty()) {
		return true;
	}
	auto iter = std::find(_pairingEndAirports.cbegin(), _pairingEndAirports.cend(), pairing.getEndArp());
	return iter != _pairingEndAirports.cend();
}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty) const {
	if (nextDuty == nullptr) {
		return true;
	}

	bool valid = false;
	int actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->GetRule()->GetDataContext());
	if (actualRest >= _minRestAtLayoverMinutes) {
		valid = true;
	}
	return valid;
}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::CheckMinWOCLAtLayover(const Duty* currDuty, const Duty* nextDuty) const {
	if (nextDuty == nullptr) {
		return true;
	}

	bool valid = false;
	int offsetTZMinutes = DutyUtils::GetTimeZoneOffsetByArr(*currDuty, this->GetRule()->GetDataContext());
	time_t startTime = currDuty->getEndTimeUtcAct() + currDuty->getMinDropoff() * 60 + offsetTZMinutes * 60;
	time_t endTime = nextDuty->getStartTimeUtcAct() - nextDuty->getMinPickup() * 60 + offsetTZMinutes * 60;
	int intervalInMinutes = TimeUtils::GetDurationOfHHmm(_sleepCycleStart, _sleepCycleEnd);
	int woclNums = DutyUtils::GetLocalNightNums(startTime, endTime, _sleepCycleStart, _sleepCycleEnd, intervalInMinutes);
	if (woclNums >= _minSleepCycles) {
		valid = true;
	}
	return valid;

}

bool MinWOCLAtLayoverStationForEvaFdRuleParam::MatchParam(const Duty* currDuty, const Duty* nextDuty, const Pairing* pairing) const {

	if (!MatchNextDutyComposition(nextDuty)) {
		return false;
	}

	if (!MatchMaxSegmentFlightTime(currDuty)) {
		return false;
	}

	if (!MatchPairingEndAirports(*pairing)) {
		return false;
	}
	return true;
}

//检查是否满足参数
int MinWOCLAtLayoverStationForEvaFdRuleParam::CheckParam(const Duty* currDuty, const Duty* nextDuty) const {
	if (nextDuty == nullptr) {
		return (int)WarnCode::NO_WARN;
	}

	int warnCode = (int)WarnCode::NO_WARN;
	if (!ignoreMinRestAtLayover() && !ignoreMinWOCLAtLayover()) {
		//“Layover最小休息时长（分钟数）” 和 “Layover最小WOCL次数” 都配置，都违规才能算违规，否则不算违规
		if (!CheckMinRestAtLayover(currDuty, nextDuty) && !CheckMinWOCLAtLayover(currDuty, nextDuty)) {
			warnCode = (int)WarnCode::MIN_REST_AT_LAYOVER_WARN | (int)WarnCode::MIN_WOCL_AT_LAYOVER_WARN;
		}
	}
	else if (!ignoreMinRestAtLayover()) {
		//仅配置“Layover最小休息时长（分钟数）”
		if (!CheckMinRestAtLayover(currDuty, nextDuty)) {
			warnCode = warnCode | (int)WarnCode::MIN_REST_AT_LAYOVER_WARN;
		}
	}
	else if (!ignoreMinWOCLAtLayover()) {
		//仅配置“Layover最小WOCL次数”
		if (!CheckMinWOCLAtLayover(currDuty, nextDuty)) {
			warnCode = warnCode | (int)WarnCode::MIN_WOCL_AT_LAYOVER_WARN;
		}
	}
	return warnCode;
}
