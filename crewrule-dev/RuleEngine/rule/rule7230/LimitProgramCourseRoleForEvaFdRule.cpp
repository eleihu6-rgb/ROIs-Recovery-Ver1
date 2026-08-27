/**
 * @file LimitProgramCourseRoleForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitProgramCourseRoleForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"


bool LimitProgramCourseRoleForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (const auto & ruleParam : _ruleParams) {

		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("crewId", crew->idCrew);

		for (auto& roster : rosters) {
			_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));

			bool valid = CheckRule(roster, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
			}
		}

		return passAllRule;
	}
	return passAllRule;
}


bool LimitProgramCourseRoleForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitProgramCourseRoleForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	//roster从非学员维度检查(即：教员IP、检查员CK、伙伴PNR等)
	auto programCourseInstructorList = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
	for (auto& programCourseInstructor : programCourseInstructorList) {
		if (ruleParam.MatchParam(*roster, programCourseInstructor)) {
			if (!ruleParam.CheckParam(programCourseInstructor)) {
				valid = false;
				ThrowRuleViolation(roster, ruleParam);
			}

		}
	}
	return valid;
}

void LimitProgramCourseRoleForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitProgramCourseRoleForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitProgramCourseRoleForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitProgramCourseRoleForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const LimitProgramCourseRoleForEvaFdRuleParam& ruleParam) const {
	string programCourseInstructorId = _ruleViolation.GetParam("programCourseInstructorId");
	string courseId = _ruleViolation.GetParam("courseId");
	string role = _ruleViolation.GetParam("role");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//机组人员在计划课程中不能分配该角色
	string msg = "Crew cannot be assigned the role ({0:role}) in the program course ({1:courseCode}).";
	msg = StringUtils::Format(msg, role, courseCode);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = StringUtils::stoll(_ruleViolation.GetParam("rosterId"), -1);
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
	rv->operation_result.insert(pair<string, string>("programCourseInstructorId", programCourseInstructorId));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("role", role));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);


}