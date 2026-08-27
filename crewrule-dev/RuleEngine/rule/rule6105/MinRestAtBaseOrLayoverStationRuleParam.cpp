/**
 * @file MinRestAtBaseOrLayoverStationRuleParam.h
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
#include "MinRestAtBaseOrLayoverStationRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void MinRestAtBaseOrLayoverStationRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::COMPOSITIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _assignments);
				}
				break;
			case enum_to_underlying(ParamLocation::BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::REST_BUNK):
				_restBunk = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(atoi(substr.c_str()));
				break;
			case enum_to_underlying(ParamLocation::SEGMENTS): {
				_segments = substr;

				vector<string> splitstrs;
				split(_segments.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_segmentsLower = std::stoi(splitstrs[0].c_str());
					_segmentsUpper = std::stoi(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BLH_RANGES): {
				_blhRanges = substr;

				vector<string> splitstrs;
				split(_blhRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_blhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_blhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FDP_RANGES): {
				_fdpRanges = substr;

				vector<string> splitstrs;
				split(_fdpRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_fdpRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_fdpRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::IS_CROSS_MIDNIGHT):
				_isCrossMidnight = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::IS_DELAY):
				_isDelay = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::LAYOVER_STATIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _layoverStations);
				}
				break;
			case enum_to_underlying(ParamLocation::MIN_REST_AT_BASE):
				_minRestAtBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(TimeUtils::hhmmToMinutes(substr));
				break;
			case enum_to_underlying(ParamLocation::MIN_REST_AT_LAYOVER):
				_minRestAtLayover = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(TimeUtils::hhmmToMinutes(substr));
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

void MinRestAtBaseOrLayoverStationRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "REST BUNK") {
			_restBunk = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(atoi(headeValue.c_str()));
		}
		else if (header == "SEGMENTS") {
			_segments = headeValue;

			vector<string> splitstrs;
			split(_segments.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_segmentsLower = std::stoi(splitstrs[0].c_str());
				_segmentsUpper = std::stoi(splitstrs[1].c_str());
			}
		}
		else if (header == "BLH RANGES") {
			_blhRanges = headeValue;

			vector<string> splitstrs;
			split(_blhRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_blhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_blhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "FDP RANGES") {
			_fdpRanges = headeValue;

			vector<string> splitstrs;
			split(_fdpRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_fdpRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_fdpRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "IS CROSS MIDNIGHT") {
			_isCrossMidnight = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "IS DELAY") {
			_isDelay = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "LAYOVER STATIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _layoverStations);
			}
		}
		else if (header == "MIN REST AT BASE") {
			_minRestAtBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "MIN REST AT LAYOVER") {
			_minRestAtLayover = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();

	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel)
		compName = CompositionRule::GetMinCompositionForRest(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchAssignment(const Duty& duty) const {
	if (_assignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	if (!base.empty()) {
        // if PO mode, extract the base string from pairing and passed to this predicate
		return BaseUtils::IsHomeBaseByBase(duty.getArrivalStation(), _bases, base);
	}
	
	// if editor mode, base is extracted from the segment's pairing
	Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
	if (pairing == nullptr) {
		spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
		return true;
	}
	return  BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), _bases, pairing->getBase());
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchRestBunkAndSegmentsAndDelay(const Duty& duty) const {

	bool hasBunk = false, delayed = false;
	int landingNum = 0;
	map<string, int>& restBunks = RuleParams::GetInstancePtr()->rest_bunk;

	vector<Segment*> segments = duty.getSegments();
	int delayMins = RuleParams::GetInstancePtr()->delayMinutes;
	for (auto& segment : segments)
	{
		string fleet = segment->getFleetCD();
		int fleetRestBunk = restBunks[fleet];
		if (!hasBunk && (_restBunk == nullptr || fleetRestBunk == *_restBunk))
		{
			hasBunk = true;
		}
		if (segment->getFlightNumber().size() > 0 && segment->getIsOperating())
			landingNum++;
		if (segment->getEndTimeUtcAct() - segment->getEndTimeUtcSch() >= delayMins * 60)
			delayed = true;
	}
	//TODO 现有法规2124中休息区没有判断级别, 是否需要判断？？？
	return hasBunk && (_isDelay == nullptr ? true : delayed == *_isDelay)
		&& (landingNum >= _segmentsLower && landingNum < _segmentsUpper);
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchBLHRanges(const Duty& duty) const {
	long blh = const_cast<Duty&>(duty).getBLKInMins();
	return (blh >= _blhRangesMinutesLower && blh < _blhRangesMinutesUpper);
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchFDPRanges(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const {
	long fdp = duty.getFDPInSecs();
	int callinSBY_FDPMins = GetCallinSBY_FDPMins(duty, mapCallinSBY_FDPMins);
	if (callinSBY_FDPMins > 0)
		fdp += callinSBY_FDPMins * 60;
	return (fdp >= _fdpRangesMinutesLower*60 && fdp < _fdpRangesMinutesUpper*60);
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchCrossMidnight(const Duty& duty) const {
	bool crossMid = false;
	vector<Segment*> segments = duty.getSegments();
	string arrStation = segments[segments.size() - 1]->getArrStation();
	auto offsetMinutes = this->GetRule()->GetDataContext()->getAirportOffsetMinutes(arrStation);
	time_t start = segments[0]->getStartTimeUtcAct();
	time_t end = segments[segments.size() - 1]->getEndTimeUtcAct();

	bool debrief = this->GetRule()->GetDataContext()->systemParamMap["MIDNIGHT_OF_REST_RULE_COUNTING_DEBRIEF"] == "Y";
	if (debrief) {
		end += duty.getMinDebrief() * 60;
	}
	time_t midnight = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes) + 24 * 3600;
	if (start < midnight && end > midnight)
		crossMid = true;
	return _isCrossMidnight == nullptr ? true : (*_isCrossMidnight == crossMid);
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchLayoverStation(const Duty& duty) const {
	if (_layoverStations.empty()) {
		return true;
	}
	string arr = duty.getArrivalStation();
	auto iter = std::find(_layoverStations.cbegin(), _layoverStations.cend(), arr);
	return iter != _layoverStations.cend();
}

bool MinRestAtBaseOrLayoverStationRuleParam::MatchRule(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const {

	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchAssignment(duty)) {
		return false;
	}

	if (!MatchRestBunkAndSegmentsAndDelay(duty)) {
		return false;
	}

	if (!MatchBLHRanges(duty)) {
		return false;
	}

	if (!MatchFDPRanges(duty, mapCallinSBY_FDPMins)) {
		return false;
	}

	if (!MatchCrossMidnight(duty)) {
		return false;
	}
	return true;
}

bool MinRestAtBaseOrLayoverStationRuleParam::CheckMinRestAtBase(const Duty* currDuty, const Duty* nextDuty, const int restDiscretionMinutes) const {
	int actualRest = currDuty->getActualRest();
	return actualRest >= (*_minRestAtBase - restDiscretionMinutes);
}

bool MinRestAtBaseOrLayoverStationRuleParam::CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty, const int restDiscretionMinutes) const {
	int actualRest = currDuty->getActualRest();
	return actualRest >= (*_minRestAtLayover - restDiscretionMinutes);
}

long MinRestAtBaseOrLayoverStationRuleParam::GetCallinSBY_FDPMins(const Duty& duty, const map<long long, long>& mapCallinSBY_FDPMins) const {
	long callinSBY_FDPMins = 0;
	if (duty.getDutySeq() == 1 && duty.getPairingId() > 0) {
		//Standby抓飞(called out)进行FDP合并仅针对第一段Duty(SBY与FLY重叠)
		auto iter = mapCallinSBY_FDPMins.find(duty.getPairingId());
		if (iter != mapCallinSBY_FDPMins.end()) {
			callinSBY_FDPMins = iter->second;
		}
	}
	return callinSBY_FDPMins;
}