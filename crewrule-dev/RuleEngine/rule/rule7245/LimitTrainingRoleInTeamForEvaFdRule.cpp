/**
 * @file LimitTrainingRoleInTeamForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitTrainingRoleInTeamForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"



bool LimitTrainingRoleInTeamForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (auto& roster : rosters) {
		auto& tmProgramCourseInstructorList = _dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);
		for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
			for (const auto& ruleParam : _ruleParams) {
				if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
					continue;
				}
				_ruleViolation.SetRuleParam(ruleParam);

				bool valid = CheckRule(roster, tmProgramCourseInstructor, crew, ruleParam);
				if (!valid) {
					passAllRule = false;
					if (!this->IsCheckAllRule()) {
						break;
					}
				}
			}
		}
	}
	return passAllRule;
}

bool LimitTrainingRoleInTeamForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const std::shared_ptr<CREW>& crew, const LimitTrainingRoleInTeamForEvaFdRuleParam& ruleParam) const {
	bool valid = false;

	if (ruleParam.MatchParam(tmProgramCourseInstructor, crew)) {
		if (!ruleParam.CheckParam(tmProgramCourseInstructor)) {
			valid = false;
			_ruleViolation.SetParam("role", tmProgramCourseInstructor->role);
			ThrowRuleViolation(roster, ruleParam);
		}
	}
	return valid;
}

void LimitTrainingRoleInTeamForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitTrainingRoleInTeamForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitTrainingRoleInTeamForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitTrainingRoleInTeamForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const LimitTrainingRoleInTeamForEvaFdRuleParam& ruleParam) const {
	string role = _ruleViolation.GetParam("role");

	//X 组成员不能担任教员X角色。
	string msg = "The members of team course of the crew {0:crewAId} cannot be assigned the {1:role} role.";
	msg = StringUtils::Format(msg, ruleParam._crewTeam, role);

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
	rv->operation_result.insert(pair<string, string>("teams", ruleParam._crewTeam));
	rv->operation_result.insert(pair<string, string>("role", role));
	_ruleViolation.AddRuleViolations(rv);
}