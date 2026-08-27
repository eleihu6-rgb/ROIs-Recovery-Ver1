/**
 * @file CheckMinRestForEvaFdRuleParam.h
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
#include "CheckMinRestForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/CompositionRule.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CheckMinRestForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENT_GROUPS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignmentGroups);
				}
				break;
			case enum_to_underlying(ParamLocation::DUTY_FLEET_GROUP):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyFleetGroups);
				}
				break;
			case enum_to_underlying(ParamLocation::DUTY_TYPE):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyTypes);
				}
				break;
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
			case enum_to_underlying(ParamLocation::BASED_MIN_REST):
				_strBasedMinRest = substr;
				_basedMinRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::INCREMENT_OF_FDP):
				_strIncrementOfFDP = substr;
				_incrementOfFDPMinutes = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
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

void CheckMinRestForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Compositions,Duty Assignments,Duty Fleet,Duty Type,BLH Ranges,Based Min Rest,Increment of FDP
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
		else if (header == "DUTY ASSIGNMENT GROUPS" || header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignmentGroups);
			}
		}
		else if (header == "DUTY FLEET") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyFleetGroups);
			}
		}
		else if (header == "DUTY TYPE" || header == "DUTY DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyTypes);
			}
		}
		else if (header == "BLH RANGE" || header == "BLH RANGES") {
			_blhRanges = headeValue;

			vector<string> splitstrs;
			split(_blhRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_blhRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_blhRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "FDP RANGE") {
			_fdpRanges = headeValue;

			vector<string> splitstrs;
			split(_fdpRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_fdpRangesMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_fdpRangesMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "BASED MIN REST") {
			_strBasedMinRest = headeValue;
			_basedMinRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "INCREMENT OF FDP") {
			_strIncrementOfFDP = headeValue;
			_incrementOfFDPMinutes = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinRestForEvaFdRuleParam::MatchComposition(const Duty& duty) const {
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

bool CheckMinRestForEvaFdRuleParam::MatchDutyAssignmentGroup(const Duty& duty) const {
	if (_dutyAssignmentGroups.empty()) {
		return true;
	}
	const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();

	string assignment = duty.getAssignment().empty() ? "FLY" : duty.getAssignment();
	for (auto assigmentGroup : _dutyAssignmentGroups) {
		if (dbData->isAssignmentInGroup(assignment, assigmentGroup)) {
			return true;
		}
	}
	return false;
}

bool CheckMinRestForEvaFdRuleParam::MatchDutyFleetGroups(const Duty& duty) const {
	if (_dutyFleetGroups.empty()) {
		return true;
	}
	vector<Segment*> segments = duty.getSegments();
	if (segments.empty()) {
		return true;
	}

	auto flySegment = duty.getFirstFlySegment();
	if (flySegment == nullptr) {
		return false;
	}
	string fleet = flySegment->getFleetCD();

	auto iterFleet = this->GetRule()->GetDataContext()->fleetMap.find(fleet);
	if (iterFleet == this->GetRule()->GetDataContext()->fleetMap.end()) {
		return false;
	}

	auto iter = std::find(_dutyFleetGroups.cbegin(), _dutyFleetGroups.cend(), iterFleet->second.fleetGrp);
	return iter != _dutyFleetGroups.cend();
}

bool CheckMinRestForEvaFdRuleParam::MatchDutyTypes(const Duty& duty) const {
	if (_dutyTypes.empty()) {
		return true;
	}
	vector<Segment*> segments = duty.getSegments();
	if (segments.empty()) {
		return true;
	}
	string domIntType = DutyUtils::getDutyType(&duty);
	auto iter = std::find(_dutyTypes.cbegin(), _dutyTypes.cend(), domIntType);
	return iter != _dutyTypes.cend();
}

bool CheckMinRestForEvaFdRuleParam::MatchBLHRanges(const Duty& duty) const {
	long blh = const_cast<Duty&>(duty).getBLKInMins();
	return (blh >= _blhRangesMinutesLower && blh <= _blhRangesMinutesUpper);
}

bool CheckMinRestForEvaFdRuleParam::MatchFDPRanges(const Duty& duty) const {
	long fdp = const_cast<Duty&>(duty).getFDPInSecs() / 60;
	return (fdp >= _fdpRangesMinutesLower && fdp <= _fdpRangesMinutesUpper);
}

bool CheckMinRestForEvaFdRuleParam::MatchRule(const Duty& duty) const {

	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchDutyAssignmentGroup(duty)) {
		return false;
	}

	if (!MatchDutyFleetGroups(duty)) {
		return false;
	}

	if (!MatchDutyTypes(duty)) {
		return false;
	}

	if (!MatchBLHRanges(duty)) {
		return false;
	}

	if (!MatchFDPRanges(duty)) {
		return false;
	}

	return true;
}

bool CheckMinRestForEvaFdRuleParam::CheckRule(const Duty* currDuty, const Duty* nextDuty, const int minRest) const {
	if (nextDuty == nullptr) {
		return true;
	}
	int	actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->GetRule()->GetDataContext());
	time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
	this->GetRule()->getRuleViolation().SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
	this->GetRule()->getRuleViolation().SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
	this->GetRule()->getRuleViolation().SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest * 60)));

	return actualRest >= minRest;
}


bool CheckMinRestForEvaFdRuleParam::CheckRule(const Duty* currDuty, const WorkPeriod* nextWorkPeriod, const int minRest) const {
	if (nextWorkPeriod != nullptr && nextWorkPeriod->GetRoster() != nullptr
		&& nextWorkPeriod->GetRoster()->callinSBY_FDPMins > 0) {
		//当前Standby存在抓飞，则不用检查min rest
		return true;
	}
	
	if (nextWorkPeriod != nullptr && AssignmentUtils::IsAssignmentMrtOveride(currDuty->getAssignment(), nextWorkPeriod->GetRoster()->qualifier, this->GetRule()->GetDataContext())) {
		return true;
	}

	int actualRest = currDuty->getActualRest();
	time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
	if (nextWorkPeriod == nullptr) {
		actualRest = minRest;
	}
	else if (nextWorkPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* nextDuty = (Duty*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->GetRule()->GetDataContext());
	}
	else if (nextWorkPeriod->GetWorkType() == WorkType::GroundRoster) {
		ROSTER* nextRoster = (ROSTER*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextRoster, this->GetRule()->GetDataContext());
	}
	
	this->GetRule()->getRuleViolation().SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
	this->GetRule()->getRuleViolation().SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
	this->GetRule()->getRuleViolation().SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest * 60)));

	if (minRest < 0) {
		//没有MinRest限制
		return true;
	}
	return actualRest >= minRest;
}