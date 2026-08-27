/**
 * @file RestrictTraineeHoldAssignmentForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "RestrictTraineeHoldAssignmentForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include <climits>
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../utils/RosterUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

bool RestrictTraineeHoldAssignmentForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(checkedStartTime, crewBase, this->GetDataContext());

	auto& tmProgramList = _dbData->tmProgramIndex->getByCrewId(crew->idCrew);
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		if (!ruleParam.MatchProgramStatus(crew)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		auto [limitStartTime, limitEndTime] = GetLimitTimeWindow(tmProgramList, offsetTZMinutes, ruleParam);

		if (limitStartTime < 0) {
			continue;
		}
		for (auto& roster : rosters) {
			if (this->IsRosterOptimizerModel() && (roster->source == "PA")) {
				//RO忽略掉对预占的检查
				continue;
			}

			//场景1：检查能否胜任教员X角色的任务
			auto& tmProgramCourseInstructorList = _dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
			for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
				if (!ruleParam.CheckRole(tmProgramCourseInstructor, limitStartTime, limitEndTime)) {
					ThrowRuleViolationForRole(tmProgramCourseInstructor, roster, ruleParam);
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}


			//场景2：检查能否胜任非训练的地面任务或Segment任务
			if (!ruleParam.CheckAssignment(roster, limitStartTime, limitEndTime)) {
				ThrowRuleViolationForAssignment(roster, ruleParam);
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

const std::tuple<time_t, time_t> RestrictTraineeHoldAssignmentForEvaFdRule::GetLimitTimeWindow(const vector<std::shared_ptr<TmProgram>>& tmProgramList, const int offsetTZMinutes, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const {
	time_t limitStartTime = -1, limitEndTime = LLONG_MAX, limitEndTime2 = LLONG_MAX;
	static time_t INVALID_TIME = utcStrToUtc("3000-01-01");
	for (auto& tmProgram : tmProgramList) {
		auto& tmFootprint = _dbData->tmFootprintIndex->getById(tmProgram->footprintId);
		if (tmFootprint == nullptr) continue;

		if (ruleParam._footprintTypesMatch.Match(tmFootprint->footprintType) && 
			ruleParam._footprintSubTypesMatch.Match(tmFootprint->footprintSubType)) {
			if (limitStartTime == -1 || limitStartTime > tmProgram->startDate) {
				limitStartTime = tmProgram->startDate;
			}

			if (ruleParam._toFirstDutyDate && (limitEndTime > INVALID_TIME || (limitEndTime < tmProgram->firstDutyDate && tmProgram->firstDutyDate < INVALID_TIME))) {
				//tmProgram.firstDutyDate之间比较取最迟的时间
				limitEndTime = (tmProgram->firstDutyDate > 0 ? (tmProgram->firstDutyDate - (time_t)offsetTZMinutes * 60) : LLONG_MAX);
			}

			//考虑program end date
			if (ruleParam._toFirstDutyDate && (limitEndTime2 > INVALID_TIME || (limitEndTime2 > tmProgram->endDate && tmProgram->endDate < INVALID_TIME))) {
				//tmProgram.endDate之间比较取最早的时间
				limitEndTime2 = (tmProgram->endDate > 0 ? (tmProgram->endDate - (time_t)offsetTZMinutes * 60) : LLONG_MAX);
			}
		}

	}
	//if (limitEndTime2 < INVALID_TIME && limitEndTime < INVALID_TIME) {
	//	//tmProgram.firstDutyDate和tmProgram.endDate比较取较早的时间
	//	return std::make_tuple(limitStartTime, limitEndTime < limitEndTime2 ? limitEndTime : limitEndTime2);
	//}
	if (limitEndTime < INVALID_TIME) {
		return std::make_tuple(limitStartTime, limitEndTime);
	}
	return std::make_tuple(limitStartTime, limitEndTime2);
}


void RestrictTraineeHoldAssignmentForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestrictTraineeHoldAssignmentForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestrictTraineeHoldAssignmentForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void RestrictTraineeHoldAssignmentForEvaFdRule::ThrowRuleViolationForRole(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const ROSTER* roster, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const {
	//机组人员不能担任教员X角色。
	string msg = "As program footprint type is {0:footprintType}/{1:footprintSubType}, crew cannot be assigned the {2:role} role.";
	msg = StringUtils::Format(msg, ruleParam._footprintTypes, ruleParam._footprintSubTypes, ruleParam._prohibitedRoles);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = tmProgramCourseInstructor->startTime;
		rv->endDTUtc = tmProgramCourseInstructor->endTime;
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->segmentId = tmProgramCourseInstructor->fltId;
		rv->startDTUtc = tmProgramCourseInstructor->startTime;
		rv->endDTUtc = tmProgramCourseInstructor->endTime;
	}

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("footprintTypes", ruleParam._footprintTypes));
	rv->operation_result.insert(pair<string, string>("footprintSubTypes", ruleParam._footprintSubTypes));
	rv->operation_result.insert(pair<string, string>("prohibitedRoles", ruleParam._prohibitedRoles));
	_ruleViolation.AddRuleViolations(rv);
}

void RestrictTraineeHoldAssignmentForEvaFdRule::ThrowRuleViolationForAssignment(const ROSTER* roster, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const {

	//机组人员不能分配X任务。
	string msg = "As program footprint type is {0:footprintType}/{1:footprintSubType}, crew cannot be assigned the assignment group ({2:assignmentGroup}) or assigment ({3:assignment}).";
	msg = StringUtils::Format(msg, ruleParam._footprintTypes, ruleParam._footprintSubTypes, ruleParam._prohibitedAssignmentGroups, ruleParam._prohibitedAssignments);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	if (roster->pairing == nullptr) {
		rv->pairingId = -1;
		rv->startDTUtc = roster->getStartTimeUtcAct();
		rv->endDTUtc = roster->getRestStartUtcAct();
	}
	else {
		rv->pairingId = roster->pairing->getDbId();
		rv->startDTUtc = roster->pairing->getStartTimeUtcAct();
		rv->endDTUtc = roster->pairing->getEndTimeUtcAct();
	}

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("footprintTypes", ruleParam._footprintTypes));
	rv->operation_result.insert(pair<string, string>("footprintSubTypes", ruleParam._footprintSubTypes));
	rv->operation_result.insert(pair<string, string>("prohibitedAssignmentGroups", ruleParam._prohibitedAssignmentGroups));
	rv->operation_result.insert(pair<string, string>("prohibitedAssignments", ruleParam._prohibitedAssignments));
	_ruleViolation.AddRuleViolations(rv);
}