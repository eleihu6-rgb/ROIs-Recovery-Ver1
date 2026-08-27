/**
 * @file CalculateFdpExtensionForCcForHXRuleParam.h
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
#include "CalculateFdpExtensionForCcForHXRuleParam.h"
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
	int maxWorkingMinutes = maxWorkingTimeMinutes > 0 ? min(maxWorkingTimeMinutes, totalTime) : totalTime;
	if (maxWorkingMinutes <= 0 || maxContinuousWorkingTimeMinutes <= 0) {
		return max(maxWorkingMinutes, 0);
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

void CalculateFdpExtensionForCcForHXRuleParam::ParseParam(const std::string& paramString) {
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
			case enum_to_underlying(ParamLocation::EXTENDED_TO_FDP): {
				_extendedToFdp = substr;
				_extendedToFdpMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CalculateFdpExtensionForCcForHXRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "MIN CONCURRENT CREW AT LANDING") {
			_minConcurrentCrewAtLandingStr = headerValue;
			_minConcurrentCrewAtLanding = (headerValue.empty() || headerValue == RuleParamConstant::ALL) ? -1 : atoi(headerValue.c_str());
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
		else if (header == "EXTENDED TO FDP") {
			_extendedToFdp = headerValue;
			_extendedToFdpMinutes = TimeUtils::hhmmToMinutes(headerValue);
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateFdpExtensionForCcForHXRuleParam::MatchParam(const Duty* duty, const time_t checkStart, const time_t checkEnd) const {
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

bool CalculateFdpExtensionForCcForHXRuleParam::MatchComposition(const Duty* duty) const {
	if (_compositionsStr.empty() || _compositionsStr == RuleParamConstant::ALL) {
		return true;
	}

	string composition = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
	return std::find(_compositions.begin(), _compositions.end(), composition) != _compositions.end();
}

bool CalculateFdpExtensionForCcForHXRuleParam::MatchPreRest(const time_t checkStart, const time_t checkEnd) const {
	if (_preRestDuration.empty() || _preRestDuration == RuleParamConstant::ALL) {
		return true;
	}

	int restDurationMinutes = (checkEnd - checkStart) / 60;
	bool lowerMatch = _preRestDurationMinutesLowerIgnored || restDurationMinutes >= _preRestDurationMinutesLower;
	bool upperMatch = _preRestDurationMinutesUpperIgnored || restDurationMinutes <= _preRestDurationMinutesUpper;
	return lowerMatch && upperMatch;
}

bool CalculateFdpExtensionForCcForHXRuleParam::MatchSingleFlySectorBlhRange(const Duty* duty) const {
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

bool CalculateFdpExtensionForCcForHXRuleParam::MatchRestFacility(const Duty* duty) const {
	if (_restFacilityStr.empty() || _restFacilityStr == RuleParamConstant::ALL) {
		return true;
	}
	for (const auto& segment : duty->getSegmentsRead()) {
		if (segment->getIsOperating()) {
			auto fleetIter = this->GetRule()->GetDataContext()->fleetMap.find(segment->getFleetCD());
			if (fleetIter != this->GetRule()->GetDataContext()->fleetMap.end()) {
				if (_restFacility == fleetIter->second.ccRestfacility)
					return true;
			}
		}
	}
	return false;
}


int CalculateFdpExtensionForCcForHXRuleParam::maxLandingCrewRestTime(
	int totalFlightTime,    // 总飞行时间（分钟）
	int crewNum,            // 总人数
	int restFacility       // 休息设施数
) const {
	// 参数校验
	if (totalFlightTime <= 0 || crewNum <= 0 || restFacility <= 0) return 0;
	if (_minConcurrentCrewAtLanding <= 0 || _minConcurrentCrewOnBoard <= 0) return 0;
	if (crewNum < _minConcurrentCrewOnBoard) return 0;

	// 可同时休息人数
	int availableRest = crewNum - _minConcurrentCrewOnBoard;

	if (_maxContinuousWorkingTimeMinutes > 0 && totalFlightTime > _maxContinuousWorkingTimeMinutes) {
		const int totalWorkRequired = totalFlightTime * _minConcurrentCrewOnBoard;
		const int sacrificeNum = max(crewNum - _minConcurrentCrewAtLanding, 0);
		const int maxWorkPerSacrifice = CalculateMaxWorkingMinutesWithContinuousLimit(
			totalFlightTime,
			_maxContinuousWorkingTimeMinutes,
			_maxWorkingTimeMinutes);
		const int totalSacrificeWork = sacrificeNum * maxWorkPerSacrifice;
		const int remainWork = max(0, totalWorkRequired - totalSacrificeWork);

		int workPerLandingCrew = remainWork / _minConcurrentCrewAtLanding;
		if (_maxWorkingTimeMinutes > 0) {
			workPerLandingCrew = min(workPerLandingCrew, _maxWorkingTimeMinutes);
		}

		const int maxRest = totalFlightTime - workPerLandingCrew;
		return min(max(maxRest, 0), totalFlightTime);
	}

	// 只要能满足同时休息 >= 设施数 -> 降落人员可以休满整个飞行时间
	if (availableRest >= restFacility) {
		return totalFlightTime;
	}

	// 人数不够轮休 -> 按比例分配
	int totalRestResource = totalFlightTime * availableRest;
	int perPerson = totalRestResource / _minConcurrentCrewAtLanding;

	return min(perPerson, totalFlightTime);
}

int CalculateFdpExtensionForCcForHXRuleParam::CalculateOptimizedRestInFlightByLandingCrew(
	vector<int> maxWorkingTimesInFlight,
	int flightTime,
	int crewNum,
	int restFacility) const {
	if (flightTime <= 0 || crewNum <= 0 || restFacility <= 0) return 0;
	if (_minConcurrentCrewAtLanding <= 0 || _minConcurrentCrewOnBoard <= 0) return 0;
	if (crewNum < _minConcurrentCrewOnBoard || crewNum < _minConcurrentCrewAtLanding) return 0;

	const int concurrentRestNum = min(restFacility, max(crewNum - _minConcurrentCrewOnBoard, 0));
	if (concurrentRestNum <= 0) return 0;

	while (static_cast<int>(maxWorkingTimesInFlight.size()) < crewNum) {
		maxWorkingTimesInFlight.push_back(flightTime);
	}

	int maxWorkingTimeByContinuousLimit = CalculateMaxWorkingMinutesWithContinuousLimit(
		flightTime,
		_maxContinuousWorkingTimeMinutes,
		_maxWorkingTimeMinutes);

	for (auto& maxWorkingTime : maxWorkingTimesInFlight) {
		maxWorkingTime = min(max(maxWorkingTime, 0), flightTime);
		maxWorkingTime = min(maxWorkingTime, maxWorkingTimeByContinuousLimit);
	}

	sort(maxWorkingTimesInFlight.begin(), maxWorkingTimesInFlight.end(), greater<int>());
	if (static_cast<int>(maxWorkingTimesInFlight.size()) > crewNum) {
		maxWorkingTimesInFlight.resize(crewNum);
	}

	const int totalWorkRequired = (crewNum - concurrentRestNum) * flightTime;
	const auto canAssignLandingRest = [&](int landingRest) {
		const int landingCrewMaxWork = flightTime - landingRest;
		int totalWorkCapacity = 0;
		vector<int> landingCapacityLosses;
		for (const auto& maxWorkingTime : maxWorkingTimesInFlight) {
			totalWorkCapacity += maxWorkingTime;
			landingCapacityLosses.push_back(max(0, maxWorkingTime - landingCrewMaxWork));
		}

		sort(landingCapacityLosses.begin(), landingCapacityLosses.end());
		for (int i = 0; i < _minConcurrentCrewAtLanding; i++) {
			totalWorkCapacity -= landingCapacityLosses[i];
		}
		return totalWorkCapacity >= totalWorkRequired;
	};

	if (!canAssignLandingRest(0)) {
		return 0;
	}

	int lower = 0;
	int upper = flightTime;
	while (lower < upper) {
		const int middle = (lower + upper + 1) / 2;
		if (canAssignLandingRest(middle)) {
			lower = middle;
		}
		else {
			upper = middle - 1;
		}
	}

	return lower;
}

int CalculateFdpExtensionForCcForHXRuleParam::GetCrewNumber(const Segment* segment, const Duty* duty) const {
	int num = 0;
	if (!segment) {
		return num;
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
					num += composition.second;
				}
			}
		}
	}

	if (num == 0 && iterCurrentPairing != dbData->pairingIdMap.end()) {
		for (const auto& composition : iterCurrentPairing->second->getComplements()) {
			auto rankIter = rankMap.find(composition.first);
			if (rankIter == rankMap.end()) {
				continue;
			}
			if (rankIter->second.isMustCrewRank &&
				(division.empty() || rankIter->second.division == division)) {
				num += composition.second;
			}
		}
	}

	return num;

	const auto& iter = dbData->crewOnFlt.find(segment->getDBId());
	if (iter == dbData->crewOnFlt.end()) {
		return num;
	}

	//客舱获取落地时最小人数中的最小空中休息时间
	const auto& crewsOnFlight = iter->second;

	for (const auto& cop : crewsOnFlight) {
		const auto& roster = dbData->findRosterByPairing(cop->crewId, segment->getPairingId());
		if (roster) {
			//获取fdp上限
			int rosterMaxFdp = roster->dutyValues.getMaxFdp(duty->getDutySeq() - 1);
			if (rosterMaxFdp == 0) {
				rosterMaxFdp = duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
			}

			if (segment->getEndTimeUtcAct() > duty->getFDPStartUtcTimes() + rosterMaxFdp * 60)
				num--;
		}
	}
	return num;
}

int CalculateFdpExtensionForCcForHXRuleParam::GetFacilityNumber(const Segment* segment) const {
	if (!segment)
		return 0;
	int num = 0;
	if (!segment->getRegister().empty()) {
		if (this->GetRule()->GetDataContext()->fltIdToAircraftMap.find(segment->getRegister()) != this->GetRule()->GetDataContext()->fltIdToAircraftMap.end()) {
			const auto& aircraft = this->GetRule()->GetDataContext()->fltIdToAircraftMap.at(segment->getRegister());
			num = aircraft->ccRestFacCnt;
			return num;
		}
	}
	if (!segment->getFleetCD().empty()) {
		if (this->GetRule()->GetDataContext()->fleetMap.find(segment->getFleetCD()) != this->GetRule()->GetDataContext()->fleetMap.end()) {
			const auto& fleet = this->GetRule()->GetDataContext()->fleetMap.at(segment->getFleetCD());
			num = fleet.ccRestFacCnt;
			return num;
		}
	}
	return num;
}

int CalculateFdpExtensionForCcForHXRuleParam::GetMinRestInFlightByLandingCrew(vector<int> restsTimeInFlight) const {
	if (restsTimeInFlight.empty())
		return 0;
	sort(restsTimeInFlight.begin(), restsTimeInFlight.end(), greater<int>());

	if (_minConcurrentCrewAtLanding <= 0) return restsTimeInFlight[0];

	if (_minConcurrentCrewAtLanding > restsTimeInFlight.size()) return restsTimeInFlight[restsTimeInFlight.size() - 1];

	return restsTimeInFlight[_minConcurrentCrewAtLanding - 1];
}

int CalculateFdpExtensionForCcForHXRuleParam::GetMaxFdp(const Duty* duty, int maxFdp) const {
	int segNum = 0;
	for (const auto seg : duty->getSegmentsRead()) {
		if (seg->getIsOperating())
			segNum++;
	}
	return min(maxFdp, _maxFdpMinutes - segNum * _eachAdditionalFlySectorMaxFdpReducedHrsMinutes);
}
