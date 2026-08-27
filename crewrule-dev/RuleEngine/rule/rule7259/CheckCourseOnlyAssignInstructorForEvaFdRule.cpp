/**
 * @file CheckCourseOnlyAssignInstructorForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckCourseOnlyAssignInstructorForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmPairingIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>
#include <iterator>

bool CheckCourseOnlyAssignInstructorForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

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

	bool passAllRule = true;

	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	for (auto& roster : rosters) {
		if (!CheckRule(roster, crew)) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool CheckCourseOnlyAssignInstructorForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	auto& tmProgramCourseInstructorIndex = _dbData->tmProgramCourseInstructorIndex;
	auto& tmProgramCourseIndex = _dbData->tmProgramCourseIndex;

	auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
		if (tmProgramCourseInstructor->groupId.empty()) {
			continue;
		}
		auto tmProgramCourseList = tmProgramCourseIndex->getByGroupId(tmProgramCourseInstructor->groupId);
		if (tmProgramCourseList.empty()) {
			valid = false;
			ThrowRuleViolation(roster, tmProgramCourseInstructor);
		}
	}
	return valid;
}

void CheckCourseOnlyAssignInstructorForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckCourseOnlyAssignInstructorForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckCourseOnlyAssignInstructorForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckCourseOnlyAssignInstructorForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor) const {
	auto& dbData = this->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseInstructor->courseId, dbData);

	//培训课程没有分配学员
	std::string msg = "The training course ({0:courseCode}) has not been assigned trainees.";
	msg = StringUtils::Format(msg, (tmCourse == nullptr ? "N/A" : tmCourse->courseCode));

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = tmProgramCourseInstructor->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = roster->pairing == nullptr ?  -1 : roster->pairing->getDbId();
	rv->segmentId = tmProgramCourseInstructor->fltId;
	rv->startDTUtc = tmProgramCourseInstructor->startTime;
	rv->endDTUtc = tmProgramCourseInstructor->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("courseId", StringUtils::lltos(tmProgramCourseInstructor->courseId)));
	rv->operation_result.insert(pair<string, string>("courseCode", (tmCourse == nullptr ? "N/A" : tmCourse->courseCode)));
	_ruleViolation.AddRuleViolations(rv);
}
