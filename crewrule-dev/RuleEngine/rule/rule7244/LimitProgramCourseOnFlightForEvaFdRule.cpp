/**
 * @file LimitProgramCourseOnFlightForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitProgramCourseOnFlightForEvaFdRule.h"
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



bool LimitProgramCourseOnFlightForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
		auto& tmProgramCourseList = _dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
		for (auto& tmProgramCourse : tmProgramCourseList) {
			if (tmProgramCourse->groupId.empty()) {
				continue;
			}
			for (const auto& ruleParam : _ruleParams) {
				if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
					continue;
				}
				_ruleViolation.SetRuleParam(ruleParam);

				bool valid = CheckRule(roster, tmProgramCourse, crew, ruleParam);
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

bool LimitProgramCourseOnFlightForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const std::shared_ptr<CREW>& crew, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	//programId
	auto& tmProgram = _dbData->tmProgramIndex->getById(tmProgramCourse->programId);
	if (tmProgram == nullptr) return true;
	auto& tmFootprint = _dbData->tmFootprintIndex->getById(tmProgram->footprintId);
	if (tmFootprint == nullptr) return true;

	
	if (ruleParam.MatchParam(tmProgramCourse, crew)) {
		//获得同航班的其他Crew的培训计划
		auto& cofProgramCourseList = _dbData->tmProgramCourseIndex->getByFlightId(tmProgramCourse->fltId);
		for (auto& cofProgramCourse : cofProgramCourseList) {
			if (cofProgramCourse->crewId == tmProgramCourse->crewId) {
				continue;
			}

			auto cofCourse = TrainingCourseUtils::GetCourseByCourseId(cofProgramCourse->courseId, _dbData);
			if (cofCourse == nullptr) {
				continue;
			}

			auto& cofProgram = _dbData->tmProgramIndex->getById(cofProgramCourse->programId);
			if (cofProgram == nullptr) {
				continue;
			}

			auto& cofFootprint = _dbData->tmFootprintIndex->getById(cofProgram->footprintId);
			if (cofFootprint == nullptr) {
				continue;
			}

			if (ruleParam.MatchParam(cofProgramCourse, cofCourse)) {
				int warnCode = ruleParam.CheckParam(cofProgramCourse, cofCourse, cofFootprint);
				if ((warnCode & (int)LimitProgramCourseOnFlightForEvaFdRuleParam::WarnCode::FOOTPRINT_WARN) == (int)LimitProgramCourseOnFlightForEvaFdRuleParam::WarnCode::FOOTPRINT_WARN) {
					valid = false;
					_ruleViolation.SetParam("crewAId", crew->idCrew);
					_ruleViolation.SetParam("crewBId", cofProgramCourse->crewId);
					_ruleViolation.SetParam("courseBCode", cofCourse->courseCode);
					ThrowRuleViolationForFootprint(roster, cofFootprint, ruleParam);
				}
				else if ((warnCode & (int)LimitProgramCourseOnFlightForEvaFdRuleParam::WarnCode::COURSE_CODE_WARN) == (int)LimitProgramCourseOnFlightForEvaFdRuleParam::WarnCode::COURSE_CODE_WARN) {
					valid = false;
					_ruleViolation.SetParam("crewAId", crew->idCrew);
					_ruleViolation.SetParam("crewBId", cofProgramCourse->crewId);
					_ruleViolation.SetParam("courseBCode", cofCourse->courseCode);
					ThrowRuleViolationForCourseCode(roster, ruleParam);
				}
			}
		}
	}
	return valid;
}

void LimitProgramCourseOnFlightForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitProgramCourseOnFlightForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitProgramCourseOnFlightForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitProgramCourseOnFlightForEvaFdRule::ThrowRuleViolationForFootprint(const ROSTER* roster, const std::shared_ptr<TmFootprint>& cofFootprint, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const {
	string crewAId = _ruleViolation.GetParam("crewAId");
	string courseACode = _ruleViolation.GetParam("courseACode");
	string crewBId = _ruleViolation.GetParam("crewBId");
	string courseBCode = _ruleViolation.GetParam("courseBCode");

	//机组人员的课程(XXX课程)和COF人员(XXX课程)不能安排在同一航班上。当存在一个学员的course code=OBS， 其余学员的footprint不能是new hire
	string msg = "The trainee crew ({0:crewAId}) with course ({1:courseACode}) and other crew ({2:crewBId}) with footprint ({3:foortprintType}) cannot be arranged on the same flight.";
	msg = StringUtils::Format(msg, crewAId, courseACode, crewBId, cofFootprint == nullptr ? "N/A" : cofFootprint->footprintType);

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
	rv->operation_result.insert(pair<string, string>("crewAId", crewAId));
	rv->operation_result.insert(pair<string, string>("courseACode", courseACode));
	rv->operation_result.insert(pair<string, string>("crewBId", crewBId));
	rv->operation_result.insert(pair<string, string>("courseBCode", courseBCode));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitProgramCourseOnFlightForEvaFdRule::ThrowRuleViolationForCourseCode(const ROSTER* roster, const LimitProgramCourseOnFlightForEvaFdRuleParam& ruleParam) const {
	string crewAId = _ruleViolation.GetParam("crewAId");
	string courseACode = _ruleViolation.GetParam("courseACode");
	string crewBId = _ruleViolation.GetParam("crewBId");
	string courseBCode = _ruleViolation.GetParam("courseBCode");

	//机组人员的课程(XXX课程)和COF人员(XXX课程)不能安排在同一航班上。一个限制OBS不能与其他课程在同一航班上
	string msg = "The trainee crew ({0:crewAId}) with course ({1:courseACode}) and other crew ({2:crewBId}) with course ({3:courseBCode}) cannot be arranged on the same flight.";
	msg = StringUtils::Format(msg, crewAId, courseACode, crewBId, courseBCode);

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
	rv->operation_result.insert(pair<string, string>("crewAId", crewAId));
	rv->operation_result.insert(pair<string, string>("courseACode", courseACode));
	rv->operation_result.insert(pair<string, string>("crewBId", crewBId));
	rv->operation_result.insert(pair<string, string>("courseBCode", courseBCode));
	_ruleViolation.AddRuleViolations(rv);
}