/**
 * @file CalculateFdpExtensionForHXRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2026-02-12
**/


#include <sstream>
#include <map>
#include <set>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateFdpExtensionForHXRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

namespace {

constexpr int kMandatoryRestAfterContinuousWorkMinutes = 60;

int CalculateMaxWorkingMinutesWithContinuousLimit(const int totalTime,
	const int maxContinuousWorkingTimeMinutes,
	const int maxWorkingTimeMinutes) {
	int maxWorkingMinutes = maxWorkingTimeMinutes > 0 ? std::min(maxWorkingTimeMinutes, totalTime) : totalTime;
	if (maxWorkingMinutes <= 0 || maxContinuousWorkingTimeMinutes <= 0) {
		return std::max(maxWorkingMinutes, 0);
	}

	for (int workMinutes = maxWorkingMinutes; workMinutes > 0; --workMinutes) {
		const int workBlockCount = (workMinutes + maxContinuousWorkingTimeMinutes - 1) / maxContinuousWorkingTimeMinutes;
		const int requiredRestMinutes = (workBlockCount - 1) * kMandatoryRestAfterContinuousWorkMinutes;
		if (workMinutes + requiredRestMinutes <= totalTime) {
			return workMinutes;
		}
	}

	return 0;
}

}

void CalculateFdpExtensionForHXRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::COMPOSITIONS): {
				_compositionsStr = substr;
				if (!_compositionsStr.empty() && _compositionsStr != RuleParamConstant::ALL) {
					split(_compositionsStr.c_str(), '|', _compositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PRE_REST_DURATION): {
				_preRestDuration = strToUpper(substr);
				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_preRestDurationMinutesLowerIgnored = (splitstrs[0] == RuleParamConstant::ALL);
					_preRestDurationMinutesUpperIgnored = (splitstrs[1] == RuleParamConstant::ALL);
					if (!_preRestDurationMinutesLowerIgnored) {
						_preRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					}
					if (!_preRestDurationMinutesUpperIgnored) {
						_preRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SINGLE_FLY_SECTOR_BLH_RANGE): {
				_singleFlySectorBlhRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_singleFlySectorBlhRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_singleFlySectorBlhRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REST_FACILITY): {
				_restFacilityStr = substr;
				_restFacility = (substr.empty() || substr == RuleParamConstant::ALL) ? -1 : atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::TOTAL_INFLIGHT_REST_DURATION): {
				_totalInflightRestDuration = substr;
				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_totalInflightRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_totalInflightRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_CONCURRENT_CREW_ON_BOARD): {
				_minConcurrentCrewOnBoardStr = substr;
				_minConcurrentCrewOnBoard = (substr.empty() || substr == RuleParamConstant::ALL) ? 0 : atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_CONTINUOUS_WORKING_TIME): {
				_maxContinuousWorkingTime = substr;
				_maxContinuousWorkingTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_WORKING_TIME): {
				_maxWorkingTime = substr;
				_maxWorkingTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::EXTEND_FDP_PCT): {
				_extendFdpPctStr = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '/', splitstrs);
					if (splitstrs.size() >= 2) {
						double numerator = atof(splitstrs[0].c_str());
						double denominator = atof(splitstrs[1].c_str());
						if (denominator != 0) {
							_extendFdpPct = numerator / denominator;
						}
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_FDP): {
				_maxFdp = substr;
				_maxFdpMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::EACH_ADDITIONAL_FLY_SECTOR_MAX_FDP_REDUCED_HRS): {
				_eachAdditionalFlySectorMaxFdpReducedHrs = substr;
				_eachAdditionalFlySectorMaxFdpReducedHrsMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CalculateFdpExtensionForHXRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//TZ Diff Range,ACC State,Unacc Away From Base Duration,Compare With Pre Duty DP(Y/N),Standard Min Rest,Physiological Rest(Y/N),Physiological Rest Time Zone(Base/Local)
	string header, headerValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headerValue = iter->second;

		if (header == "COMPOSITIONS") {
			_compositionsStr = headerValue;
			if (!_compositionsStr.empty() && _compositionsStr != RuleParamConstant::ALL) {
				split(_compositionsStr.c_str(), '|', _compositions);
			}
		}
		else if (header == "PRE REST DURATION") {
			_preRestDuration = headerValue;
			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_preRestDurationMinutesLowerIgnored = (splitstrs[0] == RuleParamConstant::ALL);
				_preRestDurationMinutesUpperIgnored = (splitstrs[1] == RuleParamConstant::ALL);
				if (!_preRestDurationMinutesLowerIgnored) {
					_preRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				}
				if (!_preRestDurationMinutesUpperIgnored) {
					_preRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		else if (header == "SINGLE FLY SECTOR BLH RANGE") {
			_singleFlySectorBlhRange = headerValue;

			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_singleFlySectorBlhRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_singleFlySectorBlhRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "REST FACILITY") {
			_restFacilityStr = headerValue;
			_restFacility = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? -1 : atoi(headerValue.c_str());
		}
		else if (header == "TOTAL IN-FLIGHT REST DURATION") {
			_totalInflightRestDuration = headerValue;
			vector<string> splitstrs;
			split(headerValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_totalInflightRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_totalInflightRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN CONCURRENT CREW ON BOARD") {
			_minConcurrentCrewOnBoardStr = headerValue;
			_minConcurrentCrewOnBoard = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? -1 : atoi(headerValue.c_str());
		}
		else if (header == "MAX CONTINUOUS WORKING TIME") {
			_maxContinuousWorkingTime = headerValue;
			_maxContinuousWorkingTimeMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else if (header == "MAX WORKING TIME") {
			_maxWorkingTime = headerValue;
			_maxWorkingTimeMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else if (header == "EXTEND FDP PCT") {
			_extendFdpPctStr = headerValue;
			if (!headerValue.empty() && headerValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(headerValue.c_str(), '/', splitstrs);
				if (splitstrs.size() >= 2) {
					double numerator = atof(splitstrs[0].c_str());
					double denominator = atof(splitstrs[1].c_str());
					if (denominator != 0) {
						_extendFdpPct = numerator / denominator;
					}
				}
			}
		}
		else if (header == "MAX FDP") {
			_maxFdp = headerValue;
			_maxFdpMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else if (header == "EACH ADDITIONAL FLY SECTOR MAX FDP REDUCED HRS") {
			_eachAdditionalFlySectorMaxFdpReducedHrs = headerValue;
			_eachAdditionalFlySectorMaxFdpReducedHrsMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateFdpExtensionForHXRuleParam::MatchParam(const Duty* duty, const time_t checkStart, const time_t checkEnd) const {
	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchPreRest(checkStart, checkEnd)) {
		return false;
	}

	if (!MatchSingleFlySectorBlhRange(duty)) {
		return false;
	}

	if (!MatchRestFacility(duty)) {
		return false;
	}

	return true;
}

bool CalculateFdpExtensionForHXRuleParam::MatchComposition(const Duty* duty) const {
	if (_compositionsStr.empty() || _compositionsStr == RuleParamConstant::ALL) {
		return true;
	}

	string composition = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
	return std::find(_compositions.begin(), _compositions.end(), composition) != _compositions.end();
}

bool CalculateFdpExtensionForHXRuleParam::MatchPreRest(const time_t checkStart, const time_t checkEnd) const {
	if (_preRestDuration.empty() || _preRestDuration == RuleParamConstant::ALL) {
		return true;
	}

	int restDurationMinutes = (checkEnd - checkStart) / 60;
	bool lowerMatch = _preRestDurationMinutesLowerIgnored || restDurationMinutes >= _preRestDurationMinutesLower;
	bool upperMatch = _preRestDurationMinutesUpperIgnored || restDurationMinutes <= _preRestDurationMinutesUpper;
	return lowerMatch && upperMatch;
}

bool CalculateFdpExtensionForHXRuleParam::MatchSingleFlySectorBlhRange(const Duty* duty) const {
	if (_singleFlySectorBlhRange.empty() || _singleFlySectorBlhRange == RuleParamConstant::ALL) {
		return true;
	}

	for (const auto& segment : duty->getSegmentsRead()) {
		if (segment->getIsOperating()) {
			if (segment->getBlkMinutes() >= _singleFlySectorBlhRangeLower && segment->getBlkMinutes() <= _singleFlySectorBlhRangeUpper) {
				return true;
			}
		}
	}
	return false;
}

bool CalculateFdpExtensionForHXRuleParam::MatchRestFacility(const Duty* duty) const {
	if (_restFacilityStr.empty() || _restFacilityStr == RuleParamConstant::ALL) {
		return true;
	}
	for (const auto& segment : duty->getSegmentsRead()) {
		if (segment->getIsOperating()) {
			auto fleetIter = this->GetRule()->GetDataContext()->fleetMap.find(segment->getFleetCD());
			if (fleetIter != this->GetRule()->GetDataContext()->fleetMap.end()) {
				if (_restFacility == fleetIter->second.restfacility)
					return true;
			}
		}
	}
	return false;
}

/**
 * @brief 计算机组核心人员（最小在岗人数）平均最大休息时长（分钟）
 * 统一核心逻辑：
 *  1. 优先让 (总人数 - 最小在岗人数) 人干满工作上限（干费）；
 *  2. 剩余 最小在岗人数 的核心人员平均承担剩余工作；
 *  3. 核心人员休息时长 = 任务总时长 - 平均工作时长（最大化且完全平均）；
 *  4. 全程保证最小在岗人数，且所有人员工作时长合规（连续/总时长不超限）。
 *
 * @param crewCount 机组总人数
 * @param totalTime 任务总时长（小时，默认12小时）
 * @param restFacility 休息设施数量
 * @return int 核心人员平均最大休息时长（分钟）
 */
int CalculateFdpExtensionForHXRuleParam::CalculateCrewMaxRestMinutes(const int maxWorkingTimeInFlight, const int flightTime, const int crewCount, const int restFacility) const {
	if (maxWorkingTimeInFlight <= 0 || flightTime <= 0 || crewCount <= 0 || restFacility <= 0) return 0;
	if (_minConcurrentCrewOnBoard <= 0 || crewCount < _minConcurrentCrewOnBoard) return 0;

	// 1. 计算实际必须在岗人数
	int mustWork = crewCount - restFacility;
	int requiredWork = std::max(_minConcurrentCrewOnBoard, mustWork);

	// 2. 总工作量需求
	int totalWorkRequired = flightTime * requiredWork;

	// 3. 干费人员 = 总人数 - 最小座人数
	int sacrificeNum = std::max(crewCount - _minConcurrentCrewOnBoard, 0);

	// 4. 核心人员自身的工作上限仍需要满足连续工作和总工作限制。
	int maxWorkPerCrew = CalculateMaxWorkingMinutesWithContinuousLimit(
		flightTime,
		_maxContinuousWorkingTimeMinutes,
		_maxWorkingTimeMinutes);
	maxWorkPerCrew = std::min(maxWorkPerCrew, maxWorkingTimeInFlight);

	// 5. 干费人员基于已计算出的最大可工作量判断，超过“连续上限+强制休息”后才允许继续贡献。
	int maxWorkPerSacrifice = maxWorkPerCrew;
	if (_maxContinuousWorkingTimeMinutes > 0 &&
		maxWorkPerSacrifice <= _maxContinuousWorkingTimeMinutes + kMandatoryRestAfterContinuousWorkMinutes) {
		maxWorkPerSacrifice = std::min(maxWorkPerSacrifice, _maxContinuousWorkingTimeMinutes);
	}

	// 6. 干费组总贡献
	int totalSacrificeWork = sacrificeNum * maxWorkPerSacrifice;

	// 7. 剩余工作量由最小座人员承担
	int remainWork = std::max(0, totalWorkRequired - totalSacrificeWork);

	// 8. 最小座每人工作时长
	int workPerMinDuty = (remainWork + _minConcurrentCrewOnBoard - 1) / _minConcurrentCrewOnBoard;
	// 同样不能超过个人总工时上限
	if (_maxWorkingTimeMinutes > 0) {
		workPerMinDuty = std::min(workPerMinDuty, _maxWorkingTimeMinutes);
	}
	workPerMinDuty = std::min(workPerMinDuty, maxWorkPerCrew);

	// 9. 最大休息时长
	int maxRest = flightTime - workPerMinDuty;

	return std::min(std::max(maxRest, 0), flightTime);
}

int CalculateFdpExtensionForHXRuleParam::GetCrewNumber(const Segment* segment) const {
	int crewNum = 0;
	if (!segment) {
		return crewNum;
	}

	auto dbData = this->GetRule()->GetDataContext();
	const auto& rankMap = dbData->rankMap;
	string division = dbData->scenario.division;
	auto iterCurrentPairing = dbData->pairingIdMap.find(segment->getPairingId());
	if (iterCurrentPairing != dbData->pairingIdMap.end()) {
		division = iterCurrentPairing->second->getDivision();
	}

	auto iterFlightPairings = dbData->flightIdToPairing.find(segment->getDBId());
	if (iterFlightPairings != dbData->flightIdToPairing.end()) {
		set<long long> pairingIds(iterFlightPairings->second.begin(), iterFlightPairings->second.end());
		for (const auto pairingId : pairingIds) {
			auto iterPairing = dbData->pairingIdMap.find(pairingId);
			if (iterPairing == dbData->pairingIdMap.end()) {
				continue;
			}

			for (const auto& composition : iterPairing->second->getComplements()) {
				auto rankIter = rankMap.find(composition.first);
				if (rankIter == rankMap.end()) {
					continue;
				}
				if (rankIter->second.isMustCrewRank &&
					(division.empty() || rankIter->second.division == division)) {
					crewNum += composition.second;
				}
			}
		}
	}

	if (crewNum > 0) {
		return crewNum;
	}

	if (iterCurrentPairing != dbData->pairingIdMap.end()) {
		for (const auto& composition : iterCurrentPairing->second->getComplements()) {
			const auto rankIter = rankMap.find(composition.first);
			if (rankIter == rankMap.end()) {
				continue;
			}
			if (rankIter->second.isMustCrewRank &&
				(division.empty() || rankIter->second.division == division)) {
				crewNum += composition.second;
			}
		}
	}
	return crewNum;
}

int CalculateFdpExtensionForHXRuleParam::GetMaxFdp(const Duty* duty, int maxFdp) const {
	int segNum = 0;
	for (const auto seg : duty->getSegmentsRead()) {
		if (seg->getIsOperating())
			segNum++;
	}
	return std::min(maxFdp, _maxFdpMinutes - segNum * _eachAdditionalFlySectorMaxFdpReducedHrsMinutes);
}

int CalculateFdpExtensionForHXRuleParam::GetFacilityNumber(const Segment* segment) const {
	if (!segment)
		return 0;
	int num = 0;
	if (!segment->getRegister().empty()) {
		if (this->GetRule()->GetDataContext()->fltIdToAircraftMap.find(segment->getRegister()) != this->GetRule()->GetDataContext()->fltIdToAircraftMap.end()) {
			const auto& aircraft = this->GetRule()->GetDataContext()->fltIdToAircraftMap.at(segment->getRegister());
			num = aircraft->fdRestFacCnt;
			return num;
		}
	}
	if (!segment->getFleetCD().empty()) {
		if (this->GetRule()->GetDataContext()->fleetMap.find(segment->getFleetCD()) != this->GetRule()->GetDataContext()->fleetMap.end()) {
			const auto& fleet = this->GetRule()->GetDataContext()->fleetMap.at(segment->getFleetCD());
			num = fleet.fdRestFacCnt;
			return num;
		}
	}
	return num;
}
