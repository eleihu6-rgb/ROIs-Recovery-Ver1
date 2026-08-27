/**
 * @file SegmentRestrictionFDPNightForEvaFdRuleParam.h
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
#include "SegmentRestrictionFDPNightForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"

using namespace std;

void SegmentRestrictionFDPNightForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::FDP_LOCAL_START): {
				_fdpLocalStartTimeHHmm = substr;
				_fdpLocalStartTimeMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::FDP_LOCAL_END): {
				_fdpLocalEndTimeHHmm = substr;
				_fdpLocalEndTimeMinutes = TimeUtils::hhmmToMinutes(substr);
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

void SegmentRestrictionFDPNightForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Compositions,Duty Assignments,FDP Local Start,FDP Local End,Max Sector
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
		else if (header == "FDP LOCAL START") {
			_fdpLocalStartTimeHHmm = headeValue;
			_fdpLocalStartTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FDP LOCAL END") {
			_fdpLocalEndTimeHHmm = headeValue;
			_fdpLocalEndTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
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

bool SegmentRestrictionFDPNightForEvaFdRuleParam::MatchRule(const Duty& duty) const {
	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	if (!MatchFDPRanges(duty)) {
		return false;
	}

	return true;
}

bool SegmentRestrictionFDPNightForEvaFdRuleParam::CheckRule(const Duty& duty) const {
	//飞行航段数量，不包含DHD等任务
	return duty.getNumFlySegs() <= this->_maxSegmentNum;
}

bool SegmentRestrictionFDPNightForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
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

bool SegmentRestrictionFDPNightForEvaFdRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

bool SegmentRestrictionFDPNightForEvaFdRuleParam::MatchFDPRanges(const Duty& duty) const {
	int offsetTZMinutes = DutyUtils::GetTimeZoneOffsetByDep(duty, this->GetRule()->GetDataContext());
	time_t fdpStartTimeLoc = duty.getFDPStartUtcTimes("ACT") + offsetTZMinutes * 60;
	time_t fdpEndTimeLoc = duty.getFDPEndUtcTimes("ACT") + offsetTZMinutes * 60;
	
	this->GetRule()->getRuleViolation().SetParam("fdpStartTimeLoc", TimeUtils::Format(fdpStartTimeLoc, "yyyy-mm-dd HH:mm"));
	this->GetRule()->getRuleViolation().SetParam("fdpEndTimeLoc", TimeUtils::Format(fdpEndTimeLoc, "yyyy-mm-dd HH:mm"));
	return TimeUtils::IsTimesInRange(fdpStartTimeLoc, this->_fdpLocalStartTimeMinutes, this->_fdpLocalEndTimeMinutes) || 
		TimeUtils::IsTimesInRange(fdpEndTimeLoc, this->_fdpLocalStartTimeMinutes, this->_fdpLocalEndTimeMinutes) || 
		TimeUtils::IsTimesInRange(this->_fdpLocalStartTimeMinutes, fdpStartTimeLoc, fdpEndTimeLoc) || 
		TimeUtils::IsTimesInRange(this->_fdpLocalEndTimeMinutes, fdpStartTimeLoc, fdpEndTimeLoc);

}

