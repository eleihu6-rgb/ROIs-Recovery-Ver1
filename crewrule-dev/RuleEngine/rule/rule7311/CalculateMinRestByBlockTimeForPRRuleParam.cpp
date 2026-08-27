/**
 * @file CalculateMinRestByBlockTimeForPRRuleParam.h
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
#include "CalculateMinRestByBlockTimeForPRRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CalculateMinRestByBlockTimeForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
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
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(strToUpper(headeValue), '|', _dutyAssignments);
			}
		}
		else if (header == "NO OF SECTORS") {
			_noOfSectors = headeValue;

			vector<string> splitstrs;
			split(_noOfSectors.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_noOfSectorsLower = atoi(splitstrs[0].c_str());
				_noOfSectorsUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "WORKING ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(strToUpper(headeValue), '|', _workingAssignmentGroups);
			}
		}
		else if (header == "IS LINE TRAINING" || header == "IS LINE TRAINING(Y/N)") {
			_isLineTraining = (headeValue.empty() || headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "FLIGHT NO") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightNo);
			}
		}
		else if (header == "EXCLUDE FLIGHT NO") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _excludeFlightNo);
			}
		}
		else if (header == "BLH RANGES") {
			if (headeValue != RuleParamConstant::ALL) {
				_blhRanges = headeValue;

			}
		}
		else if (header == "IS LAYOVER REST" || header == "IS LAYOVER REST(Y/N)") {
			if (headeValue != RuleParamConstant::ALL) {
				_isLayoverRest = headeValue;

			}
		}
		else if (header == "OVERRIDEABLE(Y/N)") {
			_isOverrideable = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "BASE REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_minBaseRest = hhmmStrToMinutes(headeValue);

			}
		}
		else if (header == "REST MULTIPLIED") {
			if (headeValue != RuleParamConstant::ALL) {
				_restMultiplied = headeValue;

			}
		}
		else if (header == "OVERRIDE DUTY ATTRIBUTES") {
			_overrideDutyAttributes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _overrideDutyAttributesVec);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchRule(const Duty& duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const {
	if (!MatchBase(duty.getBase()))
		return false;

	if (!MatchComposotion(duty))
		return false;

	if (!MatchAssignments(duty.getAssignment()))
		return false;

	if (!MatchNoOfSectors(duty))
		return false;

	if (!MatchDutyType(duty))
		return false;

	if (!MatchLineTraining(duty, flightCourseMap))
		return false;

	if (!MatchLayoverRest(duty))
		return false;

	if (!MatchFlightNo(duty))
		return false;

	if (!MatchExcludeFlightNo(duty))
		return false;

	int actualBLH = DutyUtils::GetDutyActualBLH(&duty, roster);
	if (!MatchBLHRange(actualBLH))
		return false;

	return true;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchDutyAttributes(const Duty& duty) const {
	if (_overrideDutyAttributes.empty() || _overrideDutyAttributes == "*")
		return true;

	vector<string> dutyAttributes;
	const auto& dutyAttributesStr = duty.getAttributes();
	split(dutyAttributesStr, '|', dutyAttributes);
	for (const auto& attr : _overrideDutyAttributesVec) {
		if (find(dutyAttributes.begin(), dutyAttributes.end(), attr) != dutyAttributes.end())
			return true;
	}

	return false;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchComposotion(const Duty& duty) const {
	if (_compositions.empty() || _compositions[0] == "" || _compositions[0] == "*")
		return true;

	string dutyComposition = duty.getCompositionName();
	if (dutyComposition.empty()) {
		dutyComposition = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());
	}

	if (find(_compositions.begin(), _compositions.end(), dutyComposition) == _compositions.end())
		return false;

	return true;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchDutyType(const Duty& duty) const {
	if (_dutyTypes.empty() || _dutyTypes[0] == "*")
		return true;
	const auto& dutyType = DutyUtils::getDutyType(&duty);
	return std::find(_dutyTypes.begin(), _dutyTypes.end(), dutyType) != _dutyTypes.end();
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchBase(const string& base) const {
	if (_bases.empty() || _bases[0] == "*")
		return true;

	return find(_bases.begin(), _bases.end(), base) != _bases.end();
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchAssignments(const string& assignment) const {
	if (_dutyAssignments.empty() || _dutyAssignments[0] == "*")
		return true;

	return find(_dutyAssignments.begin(), _dutyAssignments.end(), assignment) != _dutyAssignments.end();
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchNoOfSectors(const Duty& duty) const {
	if (_noOfSectors.empty() || _noOfSectors == "*")
		return true;

	int sectorCount = duty.getSegmentsRead().size();
	return sectorCount >= _noOfSectorsLower && sectorCount <= _noOfSectorsUpper;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchLineTraining(const Duty& duty, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const {
	if (_isLineTraining == nullptr) {
		return true;
	}
	if (flightCourseMap.empty()) {
		return !*_isLineTraining;
	}
	bool hasLineTrainingCourse = false;//是否有Line Training课程
    for (auto& segment : duty.getSegmentsRead()) {
        auto iter = flightCourseMap.find(segment->getDBId());
		if (iter != flightCourseMap.end()) {
			const auto& courses = iter->second;
			for (const auto& course : courses) {
				if (course->courseType == CourseType::LINE) {
					hasLineTrainingCourse = true;
					break;
				}
			}
		}
		if (hasLineTrainingCourse) {
			break;
		}
	}
	return *_isLineTraining == hasLineTrainingCourse;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchLayoverRest(const Duty& duty) const {
	if (_isLayoverRest.empty() || _isLayoverRest == "*")
		return true;

	string base = "";
	if (duty.getPairingId() && this->GetRule()->GetDataContext()->pairingIdMap.find(duty.getPairingId()) != this->GetRule()->GetDataContext()->pairingIdMap.end()) {		
		base = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()]->getBase();
	}
	else {
		base = duty.getBase();
	}
	
	if (_isLayoverRest == "Y" && duty.getArrivalStation() != base)
		return true;

	if (_isLayoverRest == "N" && duty.getArrivalStation() == base)
		return true;

	return false;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchFlightNo(const Duty& duty) const {
	if (_flightNo.empty() || _flightNo[0] == "*" && _flightNo[0] == "") {
		return true;
	}
	for (const auto& segment : duty.getSegmentsRead()) {
		if (find(_flightNo.begin(), _flightNo.end(), segment->getFlightNumber()) != _flightNo.end())
			return true;
	}

	return false;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchExcludeFlightNo(const Duty& duty) const {
	for (const auto& segment : duty.getSegmentsRead()) {
		if (!_excludeFlightNo.empty() && _excludeFlightNo[0] != "*" && _excludeFlightNo[0] != "") {
			if (find(_excludeFlightNo.begin(), _excludeFlightNo.end(), segment->getFlightNumber()) != _excludeFlightNo.end())
				return false;
		}
	}
	return true;
}

bool CalculateMinRestByBlockTimeForPRRuleParam::MatchBLHRange(const int& blh) const {
	if (_blhRanges == "*" || _blhRanges == "")
		return true;

	std::vector<std::string> blhRanges;
	split(_blhRanges, '-', blhRanges);
	if (blhRanges.size() < 2)
		return true;
	const int& blhLower = hhmmStrToMinutes(blhRanges[0]);
	const int& blhUpper = hhmmStrToMinutes(blhRanges[1]);

	return blh >= blhLower && blh < blhUpper;
}

int CalculateMinRestByBlockTimeForPRRuleParam::GetMinRest(const int blh) const {
	if (isNumberStr(_restMultiplied.c_str(), _restMultiplied.length())) {
		const auto& restMultiplied = stod(_restMultiplied);
		return max(_minBaseRest, static_cast<int>(std::ceil(blh * restMultiplied)));
	}
	return _minBaseRest;
}
