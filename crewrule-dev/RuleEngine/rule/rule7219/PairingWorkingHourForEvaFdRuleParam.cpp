/**
 * @file PairingWorkingHourForEvaFdRuleParam.h
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
#include "PairingWorkingHourForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/NumberUtils.h"
#include "../constant/Constants.h"

using namespace std;

void PairingWorkingHourForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_ASSIGNMENTS): {
				_pairingAssignments = substr;
				_pairingAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				_dutyAssignments = substr;
				_dutyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENT_GROUPS): {
				_segmentAssignmentGroups = substr;
				_segmentAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				_segmentAssignments = substr;
				_segmentAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::OTHER_SEGMENT_ASSIGNMENTS_IN_DUTY): {
				_otherSegmentAssignments = substr;
				_otherSegmentAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::NUMBER_RANGE_OF_SEGMENT_IN_DUTY): {
				_numRangeOfSegment = substr;
				_numRangeOfSegmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ANY_ONE_OF_SEGMENT_IN_DUTY_CROSS_MONTHS): {
				_isAnySegmentCrossMonths = substr;
				_isAnySegmentCrossMonthsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_CROSS_MONTHS): {
				_isSegmentCrossMonths = substr;
				_isSegmentCrossMonthsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOLLOWING_PAIRING): {
				_isFollowingPairing = substr;
				_isFollowingPairingMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODE): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::TRAINING_ROLES): {
				_trainingRoles = substr;
				_trainingRolesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODE_IN_DUTY): {
				_courseCodesInDuty = substr;
				_courseCodeInDutyMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::TRAINING_ROLES_IN_DUTY): {
				_trainingRolesInDuty = substr;
				_trainingRolesInDutyMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::WORKING_HOUR): {
				_whExpression = substr;
				if (isHHmm(substr.c_str())) {
					_whExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				}
				break;
			}
			case enum_to_underlying(ParamLocation::PERCENT): {
				_whPercent = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_WORKING_HOUR): {
				_whMaxMinutes = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_WORKING_HOUR): {
				_whMinMinutes = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_MIN_WORKING_HOUR): {
				_whMinDutyMinutes = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(substr));
				break;
			}
			case enum_to_underlying(ParamLocation::SPLIT_METHOD): {
				_splitMethod = substr;
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

void PairingWorkingHourForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Assignments,Duty Assignments,Segment Assignment Groups,Segment Assignments,Other Segment Assignments In Duty,Number Range Of Segment In Duty,Any One Of Segment In Duty Cross Months,Segment Cross Months,Following Pairing(Y/N),Course Code,Training Roles,Course Code in Duty,Training Roles in Duty,Working Hour,Percent,Min Working Hour,Max Working Hour,Duty Min Working Hour,Split Method
		if (header == "PAIRING ASSIGNMENTS") {
			_pairingAssignments = headeValue;
			_pairingAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY ASSIGNMENTS") {
			_dutyAssignments = headeValue;
			_dutyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT ASSIGNMENT GROUPS") {
			_segmentAssignmentGroups = headeValue;
			_segmentAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			_segmentAssignments = headeValue;
			_segmentAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "OTHER SEGMENT ASSIGNMENTS IN DUTY") {
			_otherSegmentAssignments = headeValue;
			_otherSegmentAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "NUMBER RANGE OF SEGMENT IN DUTY") {
			_numRangeOfSegment = headeValue;
			_numRangeOfSegmentMatch.SetExpression(headeValue, this->GetRule());

		}
		else if (header == "ANY ONE OF SEGMENT IN DUTY CROSS MONTHS") {
			_isAnySegmentCrossMonths = headeValue;
			_isAnySegmentCrossMonthsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT CROSS MONTHS") {
			_isSegmentCrossMonths = headeValue;
			_isSegmentCrossMonthsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FOLLOWING PAIRING(Y/N)") {
			_isFollowingPairing = headeValue;
			_isFollowingPairingMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "COURSE CODE") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "TRAINING ROLES") {
			_trainingRoles = headeValue;
			_trainingRolesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "COURSE CODE IN DUTY") {
			_courseCodesInDuty = headeValue;
			_courseCodeInDutyMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "TRAINING ROLES IN DUTY") {
			_trainingRolesInDuty = headeValue;
			_trainingRolesInDutyMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "WORKING HOUR") {
			_whExpression = headeValue;
			if (isHHmm(headeValue.c_str())) {
				_whExpressionMinutes = std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
			}
		}
		else if (header == "PERCENT") {
			_whPercent = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<double>(atof(headeValue.c_str()));
		}
		else if (header == "MAX WORKING HOUR") {
			_whMaxMinutes = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "MIN WORKING HOUR") {
			_whMinMinutes = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "DUTY MIN WORKING HOUR") {
			_whMinDutyMinutes = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<int>(TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "SPLIT METHOD") {
			_splitMethod = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

//判断其他Segment Assignment是否满足条件
bool PairingWorkingHourForEvaFdRuleParam::MatchOtherSegmentAssignments(const Duty* duty, const Segment* currSegment) const {
	if (_otherSegmentAssignments.empty() || _otherSegmentAssignments == RuleParamConstant::ALL) {
		return true;
	}

	if (duty->getSegments().size() == 1) {
		return false;
	}

	for (const auto& segment : duty->getSegments()) {
		if (segment->getSegmentId() == currSegment->getSegmentId()) {
			continue;
		}
		if (!_otherSegmentAssignmentsMatch.Match(*segment)) {
			return false;
		}
	}
	return true;
}

//判断Duty中特定Segment是否跨月，即Duty中特定Segment是否跨月（Layover、中转等休息跨月，不认为Duty跨月）
//特定Segment：满足_segmentAssignments 和 _segmentAssignmentGroups 条件
bool PairingWorkingHourForEvaFdRuleParam::MatchCrossMonths(const BoolMatchExpression& boolMatchExpression, const Duty* duty, const int offsetTZMinutes) const {
	for (const auto& segment : duty->getSegments()) {
		//是否跨月
		bool isCrossMonths = MatchCrossMonths(boolMatchExpression, segment , offsetTZMinutes);
		if (isCrossMonths) {
			return true;
		}
	}

	return false;
}

//判断Segment跨月
bool PairingWorkingHourForEvaFdRuleParam::MatchCrossMonths(const BoolMatchExpression& boolMatchExpression, const Segment* segment, const int offsetTZMinutes) const {
	if (!_segmentAssignmentGroupsMatch.Match(*segment)) {
		return false;
	}

	if (!_segmentAssignmentsMatch.Match(*segment)) {
		return false;
	}
	//是否跨月
	bool isCrossMonths = TimeUtils::IsCrossMonths(segment->getStartTimeUtcSch(), segment->getEndTimeUtcSch(), offsetTZMinutes);
	return boolMatchExpression.Match(isCrossMonths);
}

bool PairingWorkingHourForEvaFdRuleParam::MatchFollowingPairing(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	if (currRoster->pairing == nullptr || nextRoster == nullptr || nextRoster->pairing == nullptr) {
		return _isFollowingPairingMatch.Match(false);
	}

	bool isOverlap = false;
	if (currRoster->getRestStartUtcAct() >= nextRoster->getStartTimeUtcAct() 
		&& currRoster->getStartTimeUtcAct() < nextRoster->getStartTimeUtcAct()) {
		isOverlap = true;
	}
	return _isFollowingPairingMatch.Match(isOverlap);
}

bool PairingWorkingHourForEvaFdRuleParam::MatchFollowingSegment(const Segment* currSegment, const Segment* nextSegment) const {
	if (nextSegment == nullptr) {
		return _isFollowingPairingMatch.Match(false);
	}

	bool isOverlap = false;
	if (currSegment->getEndTimeUtcAct() >= nextSegment->getStartTimeUtcAct()
		&& currSegment->getStartTimeUtcAct() < nextSegment->getStartTimeUtcAct()) {
		isOverlap = true;
	}
	return _isFollowingPairingMatch.Match(isOverlap);
}

bool PairingWorkingHourForEvaFdRuleParam::MatchCourseCodesAndTrainingRolesInDuty(const ROSTER* currRoster, const Duty* duty) const {
	for (auto& segment : duty->getSegmentsRead()) {

		vector<long long> flightIds;
		flightIds.emplace_back(segment->getDBId());

		if (_courseCodeMatch.Match(*currRoster, flightIds) && _trainingRolesMatch.Match(*currRoster, flightIds)) {
			return true;
		}
	}
	return false;
}

bool PairingWorkingHourForEvaFdRuleParam::MatchParam(const Pairing* pairing, const Duty* duty, const Segment* currSegment, const Segment* nextSegment, const ROSTER* currRoster, const ROSTER* nextRoster, const int offsetTZMinutes) const {

	if (!_pairingAssignmentsMatch.Match(*pairing)) {
		return false;
	}

	if (!_dutyAssignmentsMatch.Match(*duty)) {
		return false;
	}

	if (!_segmentAssignmentGroupsMatch.Match(*currSegment)) {
		return false;
	}

	if (!_segmentAssignmentsMatch.Match(*currSegment)) {
		return false;
	}

	if (!MatchOtherSegmentAssignments(duty, currSegment)) {
		return false;
	}

	if (!_numRangeOfSegmentMatch.Match((int)duty->getSegments().size())) {
		return false;
	}

	if (!MatchCrossMonths(_isAnySegmentCrossMonthsMatch, duty, offsetTZMinutes)) {
		return false;
	}

	if (!MatchCrossMonths(_isSegmentCrossMonthsMatch, currSegment, offsetTZMinutes)) {
		return false;
	}

	if (!MatchFollowingSegment(currSegment, nextSegment) && !MatchFollowingPairing(currRoster, nextRoster)) {
		return false;
	}

	vector<long long> flightIds;
	flightIds.emplace_back(currSegment->getDBId());

	if (!_courseCodeMatch.Match(*currRoster, flightIds)) {
		return false;
	}

	if (!_trainingRolesMatch.Match(*currRoster, flightIds)) {
		return false;
	}

	if (!MatchCourseCodesAndTrainingRolesInDuty(currRoster, duty)) {
		return false;
	}
	return true;
}

//匹配参数
bool PairingWorkingHourForEvaFdRuleParam::MatchParam(const Segment* segment, const ROSTER* roster) const {
	if (!_segmentAssignmentGroupsMatch.Match(*segment)) {
		return false;
	}

	if (!_segmentAssignmentsMatch.Match(*segment)) {
		return false;
	}

	vector<long long> flightIds;
	flightIds.emplace_back(segment->getDBId());

	if (!_courseCodeMatch.Match(*roster, flightIds)) {
		return false;
	}
	return true;
}

