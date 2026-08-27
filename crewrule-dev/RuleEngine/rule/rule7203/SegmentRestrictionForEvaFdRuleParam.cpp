/**
 * @file SegmentRestrictionForEvaFdRuleParam.h
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
#include "SegmentRestrictionForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/CompositionRule.h"

using namespace std;

void SegmentRestrictionForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASES): {
				_strPairingBases = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingBases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_TYPE): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyTypes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::REPORT_TIME_RANGES): {
				_reportTimeRange = substr;

				vector<string> splitstrs;
				split(_reportTimeRange.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_reportTimeRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_reportTimeRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DP_ENCROACHING_PERIOD): {
				_dpEncroachingPeriod = substr;

				vector<string> splitstrs;
				split(_dpEncroachingPeriod.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_dpEncroachingPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_dpEncroachingPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ENCROACHING_DURATION): {
				_encroachingDuration = substr;

				vector<string> splitstrs;
				split(_encroachingDuration.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_encroachingDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_encroachingDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::OVERRIDE_DUTY_ATTRIBUTES): {
				if (substr != RuleParamConstant::ALL && !substr.empty()) {
					split(substr, '|', _overrideDutyAttributes);
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
			case enum_to_underlying(ParamLocation::MAX_SECTOR): {
				_maxSegmentNum = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::DEP_ARPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _depArps);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ARV_ARPS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _arvArps);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CONSECUTIVE_DUTY): {
				_consecutiveDuty = substr;

				vector<string> splitstrs;
				split(_consecutiveDuty.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_consecutiveDutyLower = atoi(splitstrs[0].c_str());
					_consecutiveDutyUpper = atoi(splitstrs[1].c_str());
				}
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

void SegmentRestrictionForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Compositions,Duty Type,Consecutive Duty,Segment Assignments,Flight Fleets,Report Time Ranges,DP Encroaching Period,Encroaching Duration,Override Duty Attributes,Sector BLH Ranges,Max Sector,Dep Arps,Arv Arps
		if (header == "BASES") {
			_strPairingBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "DUTY TYPE" || header == "DUTY DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyTypes);
			}
		}
		else if (header == "CONSECUTIVE DUTY") {
			_consecutiveDuty = headeValue;

			vector<string> splitstrs;
			split(_consecutiveDuty.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_consecutiveDutyLower = atoi(splitstrs[0].c_str());
				_consecutiveDutyUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightFleets);
			}
		}
		else if (header == "DEP ARPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _depArps);
			}
		}
		else if (header == "ARV ARPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _arvArps);
			}
		}
		else if (header == "REPORT TIME RANGE" || header == "REPORT TIME RANGES") {
			_reportTimeRange = headeValue;

			vector<string> splitstrs;
			split(_reportTimeRange.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_reportTimeRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_reportTimeRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "SECTOR BLH RANGE" || header == "SECTOR BLH RANGES") {
			_segmentBlhRanges = headeValue;

			vector<string> splitstrs;
			split(_segmentBlhRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_segmentBlhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_segmentBlhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "DP ENCROACHING PERIOD") {
			_dpEncroachingPeriod = headeValue;

			vector<string> splitstrs;
			split(_dpEncroachingPeriod.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_dpEncroachingPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_dpEncroachingPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "ENCROACHING DURATION") {
			_encroachingDuration = headeValue;

			vector<string> splitstrs;
			split(_encroachingDuration.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_encroachingDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_encroachingDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "OVERRIDE DUTY ATTRIBUTES") {
			if (headeValue != RuleParamConstant::ALL && !headeValue.empty()) {
				split(headeValue, '|', _overrideDutyAttributes);
			}
		}
		else if (header == "MAX SECTOR") {
			_maxSegmentNum = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool SegmentRestrictionForEvaFdRuleParam::MatchRule(const Duty& duty, const std::string& base) const {
	auto& dbData = this->GetRule()->GetDataContext();

	if (!MatchPairingBase(duty, base)) {
		return false;
	}

	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchDutyTypes(duty)) {
		return false;
	}

	if (dbData->scenario.airline == "BR") {
		if (!MatchMaxSegmentFlightTime(duty)) {
			return false;
		}
	}

	if (!MatchReportTime(duty)) {
		return false;
	}

	if (!MatchDPEncroachingPeriod(duty)) {
		return false;
	}

	if (!MatchDutyAttributes(duty)) {
		return false;
	}
	return true;
}

bool SegmentRestrictionForEvaFdRuleParam::CheckRule(const Duty& duty) const {
	int segNum = 0;
	auto& dbData = this->GetRule()->GetDataContext();
	for (auto& segment : duty.getSegments()) {
		if (dbData->scenario.airline == "BR") {
			if (MatchSegmentAssignments(*segment) && MatchDepArps(*segment) && MatchArvArps(*segment)) {
				segNum++;
			}
		}
		else {
			if (MatchSegmentAssignments(*segment) && MatchSegmentFlightTime(*segment) &&
				MatchFlightFleets(*segment) && MatchDepArps(*segment) && MatchArvArps(*segment)) {
				segNum++;
			}
		}
	}
	this->GetRule()->getRuleViolation().SetParam("segNum", std::to_string(segNum));
	return segNum <= this->_maxSegmentNum;
}

//判断是否满足所在基地条件
bool SegmentRestrictionForEvaFdRuleParam::MatchPairingBase(const Duty& duty, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	else {
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
		return iter != _pairingBases.cend();
	}
}

bool SegmentRestrictionForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
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

bool SegmentRestrictionForEvaFdRuleParam::MatchDutyTypes(const Duty& duty) const {
	vector<Segment*> segments = duty.getSegments();
	if (segments.empty() || _dutyTypes.empty()) {
		return true;
	}
	string domIntType = segments.at(0)->getDomIntType();
	auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
	return iter != _dutyTypes.cend();
}

//判断Segment是否满足任务类型（计算BLH的任务类型）
bool SegmentRestrictionForEvaFdRuleParam::MatchSegmentAssignments(const Segment& segment) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	string assignment = segment.getAssignment();
	auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	return iter != _segmentAssignments.cend();
}

bool SegmentRestrictionForEvaFdRuleParam::MatchFlightFleets(const Segment& segment) const {
	if (_flightFleets.empty() || !segment.getIsOperating()) {
		return true;
    }
	return std::find(_flightFleets.begin(), _flightFleets.end(), segment.getFleetCD()) != _flightFleets.end();
}

bool SegmentRestrictionForEvaFdRuleParam::MatchDepArps(const Segment& segment) const {
	if (_depArps.empty()) {
		return true;
	}
	return std::find(_depArps.begin(), _depArps.end(), segment.getDepSta()) != _depArps.end();
}

bool SegmentRestrictionForEvaFdRuleParam::MatchArvArps(const Segment& segment) const {
	if (_arvArps.empty()) {
		return true;
	}
	return std::find(_arvArps.begin(), _arvArps.end(), segment.getArrSta()) != _arvArps.end();
}

bool SegmentRestrictionForEvaFdRuleParam::MatchMaxSegmentFlightTime(const Duty& duty) const {
	if (_segmentBlhRanges.empty() || _segmentBlhRanges == RuleParamConstant::ALL) {
		return true;
	}
	int maxSegmentFt = INT_MIN;
	for (auto& segment : duty.getSegments()) {
		if (MatchSegmentAssignments(*segment)) {
			int blkMinutes = SegmentUtils::GetBlkMinutes(*segment);
			if (blkMinutes > maxSegmentFt) {
				maxSegmentFt = blkMinutes;
			}
		}
	}
	return (maxSegmentFt >= _segmentBlhRangesMinutesLower && maxSegmentFt < _segmentBlhRangesMinutesUpper);

}

bool SegmentRestrictionForEvaFdRuleParam::MatchSegmentFlightTime(const Segment& segment) const {
	if (_segmentBlhRanges.empty() || _segmentBlhRanges == RuleParamConstant::ALL) {
		return true;
	}
	int blkMinutes = SegmentUtils::GetBlkMinutes(segment);
	return (blkMinutes >= _segmentBlhRangesMinutesLower && blkMinutes < _segmentBlhRangesMinutesUpper);
}

bool SegmentRestrictionForEvaFdRuleParam::MatchReportTime(const Duty& duty) const {
	if (_reportTimeRange.empty() || _reportTimeRange == RuleParamConstant::ALL) {
		return true;
	}
	time_t checkinLoc = duty.getStartTimeLocAct();
	return TimeUtils::IsTimesInRange(checkinLoc, _reportTimeRangeMinutesLower, _reportTimeRangeMinutesUpper);
}

bool SegmentRestrictionForEvaFdRuleParam::MatchDPEncroachingPeriod(const Duty& duty) const {
	if (_dpEncroachingPeriod.empty() || _dpEncroachingPeriod == RuleParamConstant::ALL) {
		return true;
	}
	int offsetTZMinutes = static_cast<int>(duty.getStartTimeLocAct() - duty.getStartTimeUtcAct()) / 60;
	time_t checkinLoc = duty.getStartTimeLocAct();
	time_t checkoutLoc = duty.getEndTimeUtcAct() + (time_t)offsetTZMinutes * 60; //使用起飞机场时区

	bool isCovered = TimeUtils::IsTimesCovered(checkinLoc, checkoutLoc, _dpEncroachingPeriodMinutesLower, _dpEncroachingPeriodMinutesUpper);
	
	if (!isCovered) {
		return false;
	}

	if (_encroachingDuration.empty() || _encroachingDuration == RuleParamConstant::ALL) {
		return true;
	}

	int overlapMinutes = TimeUtils::GetOverlapDuration(checkinLoc, checkoutLoc, 
		_dpEncroachingPeriodMinutesLower, _dpEncroachingPeriodMinutesUpper, offsetTZMinutes);

	return (overlapMinutes >= _encroachingDurationMinutesLower && overlapMinutes <= _encroachingDurationMinutesUpper);
}

bool SegmentRestrictionForEvaFdRuleParam::MatchDutyAttributes(const Duty& duty) const {
	if (_overrideDutyAttributes.empty())
		return true;

	if (duty.getAttributes().empty())
		return false;
	else {
		vector<string> attributes;
		split(duty.getAttributes(), '|', attributes);
		bool found = false;
		for (const auto& attr : _overrideDutyAttributes) {
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
