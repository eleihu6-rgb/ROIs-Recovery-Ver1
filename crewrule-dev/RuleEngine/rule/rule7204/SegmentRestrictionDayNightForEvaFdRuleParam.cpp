/**
 * @file SegmentRestrictionDayNightForEvaFdRuleParam.h
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
#include "SegmentRestrictionDayNightForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void SegmentRestrictionDayNightForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::COMPOSITIONS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DEPARTURE_START): {
				_departureStartTimeHHmm = substr;
				_departureStartTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::DEPARTURE_END): {
				_departureEndTimeHHmm = substr;
				_departureEndTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DUTY_BLH): {
				_minDutyFt = substr;
				_minDutyFtMinutes = (substr == RuleParamConstant::ALL) ? INT_MIN : TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DUTY_FDP): {
				_minDutyFDP = substr;
				_minDutyFDPMinutes = (substr == RuleParamConstant::ALL) ? INT_MIN : TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_SECTOR): {
				_maxSegmentNum = atoi(substr.c_str());
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

void SegmentRestrictionDayNightForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Compositions,Duty Assignments,Departure Start,Departure End,Min Duty BLH,Min Duty FDP,Max Sector
		if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "DEPARTURE START") {
			_departureStartTimeHHmm = headeValue;
			_departureStartTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "DEPARTURE END") {
			_departureEndTimeHHmm = headeValue;
			_departureEndTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN DUTY BLH") {
			_minDutyFt = headeValue;
			_minDutyFtMinutes = (headeValue == RuleParamConstant::ALL) ? INT_MIN : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN DUTY FDP") {
			_minDutyFDP = headeValue;
			_minDutyFDPMinutes = (headeValue == RuleParamConstant::ALL) ? INT_MIN : TimeUtils::hhmmToMinutes(headeValue);
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

bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchRule(const Duty& duty) const {
	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	if (!MatchFirstSegmentDeparture(duty)) {
		return false;
	}

	if (!MatchDutyFlightTime(duty)) {
		return false;
	}

	if (!MatchDutyFDP(duty)) {
		return false;
	}
	return true;
}

bool SegmentRestrictionDayNightForEvaFdRuleParam::CheckRule(const Duty& duty) const {
	//飞行航段数量，不包含DHD等任务
	return duty.getNumFlySegs() <= this->_maxSegmentNum;
}

bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();

	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel)
		compName = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(&duty), this->GetRule()->GetDataContext());

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}

bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchFirstSegmentDeparture(const Duty& duty) const {
	time_t startTimeLoc = duty.getFirstSegment()->getStartTimeLocAct();
	return TimeUtils::IsTimesInRange(startTimeLoc, this->_departureStartTimeMinutes, this->_departureEndTimeMinutes);
}

//判断Duty的飞时是否满足
bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchDutyFlightTime(const Duty& duty) const {
	int ftMinutes = const_cast<Duty&>(duty).getBLKInMins();
	this->GetRule()->getRuleViolation().SetParam("ftMinutes", TimeUtils::MinutesTohhmm(ftMinutes));
	if (_minDutyFt == RuleParamConstant::ALL) {
		return true;
	}
	return ftMinutes >= this->_minDutyFtMinutes;
}

//判断Duty的FDP是否满足
bool SegmentRestrictionDayNightForEvaFdRuleParam::MatchDutyFDP(const Duty& duty) const {
	int fdpMinutes = duty.getFDPInSecs() / 60;
	this->GetRule()->getRuleViolation().SetParam("fdpMinutes", TimeUtils::MinutesTohhmm(fdpMinutes));

	if (_minDutyFDP == RuleParamConstant::ALL) {
		return true;
	}
	return fdpMinutes >= this->_minDutyFDPMinutes;
}




