/**
 * @file CalculateFdpAndExtensionFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateFdpAndExtensionFor5JRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

void CalculateFdpAndExtensionFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "COMPOSITIONS") {
			_compositionsStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "DUTY FLEETS") {
			_dutyFleetsStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyFleets);
			}
		}
		else if (header == "DUTY TYPE" || header == "DUTY DIR") {
			_dutyType = headeValue;
		}
		else if (header == "DEPARTURE RANGE") {
			_departureRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_departureStart = hhmmStrToMinutes(headeValue.substr(0, headeValue.find("-")));
					_departureEnd = hhmmStrToMinutes(headeValue.substr(headeValue.find("-") + 1));
				}
			}
		}
		else if (header == "RPT RANGE") {
			_rptRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_rptStart = hhmmStrToMinutes(headeValue.substr(0, headeValue.find("-")));
					_rptEnd = hhmmStrToMinutes(headeValue.substr(headeValue.find("-") + 1));
				}

			}
		}
		else if (header == "LANDING RANGE") {
			_landingRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_landingLower = stoi(headeValue.substr(0, headeValue.find("-")));
					_landingUpper = stoi(headeValue.substr(headeValue.find("-") + 1));
				}

			}
		}
		else if (header == "SINGLE BLH RANGE") {
			_singleBlhRange = headeValue;
			_singleBlhRangesMinutes.clear();
			if (headeValue != RuleParamConstant::ALL) {
				vector<string> singleBlhRanges;
				split(headeValue, '&', singleBlhRanges);
				for (const auto& singleBlhRange : singleBlhRanges) {
					vector<string> splitstrs;
					split(singleBlhRange.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_singleBlhRangesMinutes.emplace_back(
							TimeUtils::hhmmToMinutes(splitstrs[0].c_str()),
							TimeUtils::hhmmToMinutes(splitstrs[1].c_str()));
					}
				}
			}
		}
		else if (header == "REST FACILITY") {
			_restFacilityStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_restFacility = stoi(headeValue);
			}
		}
		else if (header == "OVERRIDE DUTY ATTRIBUTES") {
			_dutyAttributesStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAttributes);
			}
		}
		else if (header == "BLH RANGE") {
			_blhRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_blhRangeStart = hhmmStrToMinutes(headeValue.substr(0, headeValue.find("-")));
					_blhRangeEnd = hhmmStrToMinutes(headeValue.substr(headeValue.find("-") + 1));
				}
			}
		}
		else if (header == "WOCL OVERLAP RANGE") {
			_woclOverlapRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				if (headeValue.find("-") != string::npos) {
					_woclOverlapRangeStart = hhmmStrToMinutes(headeValue.substr(0, headeValue.find("-")));
					_woclOverlapRangeEnd = hhmmStrToMinutes(headeValue.substr(headeValue.find("-") + 1));
				}
			}
		}
		else if (header == "MAX SECTORS") {
			_maxSectorsStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_maxSectors = stoi(headeValue);
			}
		}
		else if (header == "MAX FDP") {
			_maxFDPStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_maxFDP = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "MAX EXTENSION") {
			_maxExtensionStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_maxExtension = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "IS AUGMENT") {
			_isAugment = headeValue == "Y";
		}
		else if (header == "IS SPLIT") {
			_isSplitStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				_isSplit = headeValue == "Y";
			}
		}
		else if (header == "ACC STATES") {
			_accStatesStr = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _accStates);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchRuleParam(Duty* duty) const {

	if (!MatchComposition(duty))
		return false;

	if (!MatchDutyFleet(duty))
		return false;

	if (!MatchDutyType(duty))
		return false;

	if (!MatchDepartureTime(duty))
		return false;

	if (!MatchRptTime(duty))
		return false;

	if (!MatchLandingNumber(duty))
		return false;

	if (!MatchRestFacility(duty))
		return false;

	if (!MatchDutyAttributes(duty))
		return false;

	if (!MatchDutyBlhRange(duty))
		return false;

	if (!MatchWoclOverlapRange(duty))
		return false;

	if (!MatchMaxSectors(duty))
		return false;

	if (!MatchAccStates(duty))
		return false;

	if (!MatchSplitDuty(duty))
		return false;

	if (!MatchBlhRange(duty))
		return false;

	return true;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchComposition(Duty* duty) const {

	if (_compositionsStr.empty() || _compositionsStr == "*")
		return true;

	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->GetRule()->IsEditorModel())
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->GetRule()->GetDataContext());
		//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
		duty->setCompositionName(strComplement);
	}

	return find(_compositions.begin(), _compositions.end(), strComplement) != _compositions.end();
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchDutyFleet(const Duty* duty) const {

	if (_dutyFleetsStr.empty() || _dutyFleetsStr == "*")
		return true;

	const auto& seg = duty->getFirstFlySegment();
	if (seg) {
		string fleetGrp = this->GetRule()->GetDataContext()->fleetMap[seg->getFleetCD()].fleetGrp;
		return find(_dutyFleets.begin(), _dutyFleets.end(), fleetGrp) != _dutyFleets.end();
	}
	return true;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchDutyType(const Duty* duty) const {
	
	if (_dutyType.empty() || _dutyType == "*")
		return true;
	
	return DutyUtils::getDutyType(duty) == _dutyType;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchDepartureTime(const Duty* duty) const {

	if (_departureRange.empty() || _departureRange == "*")
		return true;

	time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();

	// 边界值大于等于并且小于
	return TimeUtils::IsTimesInRange(depTimeLocal, _departureStart, _departureEnd - 1);
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchRptTime(const Duty* duty) const {

	if (_rptRange.empty() || _rptRange == "*")
		return true;

	const auto& offset = duty->getRefTimeZone();

	time_t checkinLocal = duty->getStartTimeUtcAct() + offset * 60;

	// 边界值大于等于并且小于
	return TimeUtils::IsTimesInRange(checkinLocal, _rptStart, _rptEnd - 1);
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchLandingNumber(const Duty* duty) const {

	if (_landingRange.empty() || _landingRange == "*")
		return true;
	
	int landing = DutyUtils::getLangdingNums(duty, this->GetRule()->GetDataContext().get());

	return landing >= _landingLower && landing < _landingUpper;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchRestFacility(const Duty* duty) const {

	if (_restFacilityStr.empty() || _restFacilityStr == "*")
		return true;

	int i = DutyUtils::GetRestfacility(duty, this->GetRule()->GetDataContext());

	return i == _restFacility;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchDutyAttributes(const Duty* duty) const {

	if (_dutyAttributesStr.empty() || _dutyAttributesStr == "*")
		return true;

	if (duty->getAttributes().empty())
		return false;
	else {
		vector<string> attributes;
		split(duty->getAttributes(), '|', attributes);
		bool found = false;
		for (const auto& attr : _dutyAttributes) {
			if (find(attributes.begin(), attributes.end(), attr) != attributes.end()) {
				found = true;
				break;
			}
		}
		if (!found) {
			return false;
		}
	}
	return true;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchDutyBlhRange(const Duty* duty) const {

	if (_blhRange.empty() || _blhRange == "*")
		return true;

	const auto& dutyBLH = duty->getScheduleBlockTime();
	return dutyBLH >= _blhRangeStart && dutyBLH < _blhRangeEnd;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchWoclOverlapRange(const Duty* duty) const {

	if (_woclOverlapRange.empty() || _woclOverlapRange == "*")
		return true;

	const auto& startOffset = DutyUtils::GetTimeZoneOffsetByDep(*duty, this->GetRule()->GetDataContext());
	const auto& endOffset = DutyUtils::GetTimeZoneOffsetByArr(*duty, this->GetRule()->GetDataContext());
	int overlapMinutes = DutyUtils::GetWoclOverlapTime(duty->getFDPStartUtcTimes() + startOffset * 60, duty->getFDPEndUtcTimes() + endOffset * 60, 0);

	return overlapMinutes >= _woclOverlapRangeStart && overlapMinutes < _woclOverlapRangeEnd;
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchMaxSectors(const Duty* duty) const {

	if (_maxSectorsStr.empty() || _maxExtensionStr == "*")
		return true;

	int sectorCount = 0;
	for (const auto& seg : duty->getSegmentsRead()) {
		if (seg->getIsOperating())
			++sectorCount;
	}
	return sectorCount <= _maxSectors;

}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchSplitDuty(const Duty* duty) const {
	if (_isSplitStr.empty() || _isSplitStr == "*")
		return true;

	const auto & transit = RuleParams::GetInstancePtr()->isLongTransit(duty);
	
	return ((_isSplit && transit) || (!_isSplit && !transit));
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchAccStates(const Duty* duty) const {
	if (_accStatesStr.empty() || _accStatesStr == "*")
		return true;

	return find(_accStates.begin(), _accStates.end(), duty->getAccState()) != _accStates.end();
}

bool CalculateFdpAndExtensionFor5JRuleParam::MatchBlhRange(const Duty* duty) const {
	if (_singleBlhRange.empty() || _singleBlhRange == "*")
		return true;

	if (_singleBlhRangesMinutes.empty()) {
		return false;
	}

	vector<int> segmentBlhMinutes;
	for (const auto& segment : duty->getSegmentsRead()) {
		segmentBlhMinutes.push_back(segment->getSchBlkMinutes());
	}

	return SegmentUtils::MatchDistinctSegmentsForRanges(segmentBlhMinutes, _singleBlhRangesMinutes);
}
