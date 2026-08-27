/**
 * @file PerDiemHoursForEvaFdRuleParam.h
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
#include "PerDiemHoursForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

using namespace std;

void PerDiemHoursForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_ASSIGNMENT_GROUPS): {
				_pairingAssignmentGroups = substr;
				_pairingAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				_dutyAssignments = substr;
				_dutyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::OTHER_DUTY_ASSIGNMENTS_IN_PAIRING): {
				_otherDutyAssignmentsInPairing = substr;
				_otherDutyAssignmentsInPairingMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::NUMBER_RANGE_OF_SEGMENT_IN_DUTY): {
				_numRangeOfSegment = substr;
				_numRangeOfSegmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_SUB_TYPES): {
				_footprintSubtypes = substr;
				_footprintSubtypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODE): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ROLE): {
				_trainRoles = substr;
				_trainingRoleMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IP_CK_QUAL): {
				_IPOrCKQuals = substr;
				_IPOrCKQualMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ROLE_IN_ROSTER): {
				_trainRolesInRoster = substr;
				_trainingRoleInRosterMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::CHIEF_PILOT_RANK): {
				_chiefPilotRanks = substr;
				_chiefPilotRankMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_SPECIAL_TAG): {
				_segmentSpecialTag = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::PER_DIEM): {
				_perDiemExpression = substr;
				if (isHHmm(substr.c_str())) {
					_perDiemExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				}
				if (_perDiemExpression == "0") {
					_perDiemExpressionMinutes = std::make_shared<int>(0);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PER_DIEM_GAP): {
				_perDiemGap = substr;
				_perDiemGapMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::DELAY_BUFFER): {
				_perDiemDelayBuffer = substr;
				_perDiemDelayBufferMinutes = TimeUtils::hhmmToMinutes(substr);
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

void PerDiemHoursForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Assignment Groups,Duty Assignments,Other Duty Assignments in Pairing,Number Range of Segment in Duty,Footprint subtypes,Course Code,Role(Trainer/Trainee),IP/CK QUAL,Role(Trainer/Trainee) in Roster,Chief Pilot Rank,Segment Special Tag,Per Diem,Per Diem Gap,Delay Buffer
		if (header == "PAIRING ASSIGNMENT GROUPS") {
			_pairingAssignmentGroups = headeValue;
			_pairingAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY ASSIGNMENTS") {
			_dutyAssignments = headeValue;
			_dutyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "OTHER DUTY ASSIGNMENTS IN PAIRING") {
			_otherDutyAssignmentsInPairing = headeValue;
			_otherDutyAssignmentsInPairingMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "NUMBER RANGE OF SEGMENT IN DUTY") {
			_numRangeOfSegment = headeValue;
			_numRangeOfSegmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FOOTPRINT SUBTYPES") {
			_footprintSubtypes = headeValue;
			_footprintSubtypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "COURSE CODE") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ROLE(TRAINER/TRAINEE)") {
			_trainRoles = headeValue;
			_trainingRoleMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "IP/CK QUAL") {
			_IPOrCKQuals = headeValue;
			_IPOrCKQualMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ROLE(TRAINER/TRAINEE) IN ROSTER") {
			_trainRolesInRoster = headeValue;
			_trainingRoleInRosterMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "CHIEF PILOT RANK") {
			_chiefPilotRanks = headeValue;
			_chiefPilotRankMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT SPECIAL TAG") {
			_segmentSpecialTag = headeValue;
		}
		else if (header == "PER DIEM") {
			_perDiemExpression = headeValue;
			if (isHHmm(headeValue.c_str())) {
				_perDiemExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
			}

			if (_perDiemExpression == "0") {
				_perDiemExpressionMinutes = std::make_shared<int>(0);
			}
		}
		else if (header == "PER DIEM GAP") {
			_perDiemGap = headeValue;
			_perDiemGapMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "DELAY BUFFER") {
			_perDiemDelayBuffer = headeValue;
			_perDiemDelayBufferMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

bool PerDiemHoursForEvaFdRuleParam::MatchParam(const Pairing* pairing, const Duty* duty, const ROSTER* roster) const {

	if (!_pairingAssignmentGroupsMatch.Match(*pairing)) {
		return false;
	}

	if (!_dutyAssignmentsMatch.Match(*duty)) {
		return false;
	}

	if (!MatchOtherDutyAssignments(pairing, duty)) {
		return false;
	}

	if (!_numRangeOfSegmentMatch.Match((int)duty->getSegments().size())) {
		return false;
	}

	if (!MatchFootprintSubType(roster, duty)) {
		return false;
	}

	vector<long long> flightIds;
	for (auto& segment : duty->getSegments()) {
		flightIds.emplace_back(segment->getDBId());
	}

	if (!_courseCodeMatch.Match(*roster, flightIds)) {
		return false;
	}

	if (!_trainingRoleMatch.Match(*roster, flightIds)) {
		return false;
	}

	if (!_IPOrCKQualMatch.Match(*roster)) {
		return false;
	}

	if (!_chiefPilotRankMatch.Match(*roster)) {
		return false;
	}

	if (roster->pairing != nullptr) {
		vector<long long> allFlightIds;
		for (auto& segment : roster->pairing->getSegmentsRead()) {
			allFlightIds.emplace_back(segment->getDBId());
		}
		if (!_trainingRoleInRosterMatch.Match(*roster, allFlightIds)) {
			return false;
		}
	}
	return true;

}

//判断其他Segment Assignment是否满足条件
bool PerDiemHoursForEvaFdRuleParam::MatchOtherDutyAssignments(const Pairing* pairing, const Duty* currDuty) const {
	if (_otherDutyAssignmentsInPairing.empty() || _otherDutyAssignmentsInPairing == RuleParamConstant::ALL) {
		return true;
	}

	if (pairing->getDutyVec().size() == 1) {
		return false;
	}
	for (const auto& duty : pairing->getDutyVec()) {
		if (duty->getDutyId() == currDuty->getDutyId()) {
			continue;
		}
		//任一一个其他Duty的Assignment满足条件即可
		if (_otherDutyAssignmentsInPairingMatch.Match(*duty)) {
			return true;
		}
	}
	return false;
}

bool PerDiemHoursForEvaFdRuleParam::MatchFootprintSubType(const ROSTER* roster, const Duty* duty) const {
	if (_footprintSubtypes == RuleParamConstant::ALL || _footprintSubtypes.empty() || duty == nullptr) {
		return true;
	}
	for (auto& segment : duty->getSegments()) {
		if (!MatchFootprintSubType(roster, segment)) {
			return false;
		}
	}
    return true;
}

bool PerDiemHoursForEvaFdRuleParam::MatchFootprintSubType(const ROSTER* roster, const Segment* segment) const {
	if (_footprintSubtypes == RuleParamConstant::ALL || _footprintSubtypes.empty() || segment == nullptr) {
		return true;
	}

	auto& dbData = this->GetRule()->GetDataContext();

	auto tmFootprintList = TrainingCourseUtils::GetFootprintList(roster, segment, dbData);
	for (auto& tmFootprint : tmFootprintList) {
		if (_footprintSubtypesMatch.Match(tmFootprint->footprintSubType)) {
			return true;
		}
	}
	return false;
}

bool PerDiemHoursForEvaFdRuleParam::ExistSegmentSpecialTag(const ROSTER* roster, const Duty * duty) const {
	const std::shared_ptr<CrewDataContext>& dbData = this->GetRule()->GetDataContext();

	vector<shared_ptr<RosterFlight>> rosterFlights = dbData->rosterFlightMgr.get(roster->idcrew);
	for (auto& rosterFlight : rosterFlights) {
		if (rosterFlight->rosterId == roster->rosterId  && rosterFlight->dutyId == duty->getDutyId()) {
			vector<string> tsFlags;
			split(rosterFlight->tsFlag, '|', tsFlags);
			if (std::find(tsFlags.begin(), tsFlags.end(), this->_segmentSpecialTag) != tsFlags.end())
			{
				return true;
			}
		}
	}
	return false;
}

////匹配参数
//bool PerDiemHoursForEvaFdRuleParam::MatchParam(const ROSTER* roster) const {
//
//	if (roster->pairing == nullptr && !_pairingAssignmentGroupsMatch.Match(*roster)) {
//		return false;
//	}
//
//	//飞行任务使用Segment.Assigment来匹配该参数，地面任务使用GroundRoster.Assignment来匹配该参数
//	if (roster->pairing == nullptr && !_dutyAssignmentsMatch.Match(*roster)) {
//		return false;
//	}
//
//	if (!_courseCodeMatch.Match(*roster)) {
//		return false;
//	}
//
//	if (!_trainingRoleMatch.Match(*roster)) {
//		return false;
//	}
//
//	if (!_IPOrCKQualMatch.Match(*roster)) {
//		return false;
//	}
//	
//	if (!_chiefPilotRankMatch.Match(*roster)) {
//		return false;
//	}
//	return true;
//}
