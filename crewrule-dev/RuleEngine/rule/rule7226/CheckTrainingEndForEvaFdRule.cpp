/**
 * @file MinWOCLAtLayoverStationForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckTrainingEndForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
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

bool CheckTrainingEndForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	bool next = true;

	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	for (auto& roster : rosters) {
		if (this->IsRosterOptimizerModel() && (roster->source == "PA")) {
			//RO忽略掉对预占的检查
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));

		bool valid = CheckRule(roster, crew);
		if (!valid) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

void CheckTrainingEndForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckTrainingEndForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckTrainingEndForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool CheckTrainingEndForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;

	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;

	//结案仅针对学员
	const auto programCourseList = tmProgramCourseIndex->getByRosterId(roster->rosterId);
	for(auto& programCourse : programCourseList) {
		auto tmProgram = tmProgramIndex->getById(programCourse->programId);
		if (tmProgram == nullptr) {
			Logger::getRuleLogger()->error("[DataCheck] ERROR: invalid data, program does not exist.programId:{}", programCourse->programId);
			continue;
		}

		if (tmProgram->status != "MANUAL END") {
			continue;
		}
	
		const auto programCourseListInProgram = tmProgramCourseIndex->getByProgramId(tmProgram->id);
		for (auto& programCourseInProgram : programCourseListInProgram) {
			if (programCourseInProgram->rosterId == roster->rosterId && programCourseInProgram->startTime > tmProgram->endDate) {
				valid = false;
				_ruleViolation.SetParam("programId", StringUtils::lltos(tmProgram->id));
				_ruleViolation.SetParam("programName", tmProgram->name);
				_ruleViolation.SetParam("programCourseId", StringUtils::lltos(programCourseInProgram->id));
				_ruleViolation.SetParam("courseId", StringUtils::lltos(programCourseInProgram->courseId));
				auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourseInProgram->courseId, this->GetDataContext());
				if (tmCourse != nullptr) {
					_ruleViolation.SetParam("courseCode", tmCourse->courseCode);
				}
				ThrowRuleViolationForCourseEnd(roster);

				if (!IsCheckAllRule()) {
					return valid;
				}
			}
		}
	}
	return valid;
}

void CheckTrainingEndForEvaFdRule::ThrowRuleViolationForCourseEnd(const ROSTER* roster) const {
	string programCourseId = _ruleViolation.GetParam("programCourseId");
	string programName = _ruleViolation.GetParam("programName");
	string programId = _ruleViolation.GetParam("programId");
	string courseId = _ruleViolation.GetParam("courseId");
	string courseCode = _ruleViolation.GetParam("courseCode");

	//培训课程提前结束
	std::string msg = "The training course ({0:courseCode}) of the program ({1:programName}) ended early.";
	msg = StringUtils::Format(msg, courseCode, programName);

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
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourseId));
	rv->operation_result.insert(pair<string, string>("programId", programId));
	rv->operation_result.insert(pair<string, string>("courseId", courseId));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	_ruleViolation.AddRuleViolations(rv);
}