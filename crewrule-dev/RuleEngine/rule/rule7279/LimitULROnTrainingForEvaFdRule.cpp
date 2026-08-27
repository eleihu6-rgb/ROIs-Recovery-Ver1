/**
 * @file LimitULROnTrainingForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-14
**/

#include "../RuleSytem.h"
#include "LimitULROnTrainingForEvaFdRule.h"
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
#include "../utils/SegmentUtils.h"



bool LimitULROnTrainingForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
	_ruleViolation.SetParam("crewId", crew->idCrew);

	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		for (auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);

			bool valid = CheckRule(roster, crew, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}

	}
	return passAllRule;
}

bool LimitULROnTrainingForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	for (auto& duty : roster->pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			auto programCourseList = tmProgramCourseIndex->getByFlightId(segment->getDBId());
			for (auto& programCourse : programCourseList) {
				bool valid = CheckRule(roster, duty, segment, programCourse, crew, ruleParam);
				if (!valid) {
					passAllRule = false;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitULROnTrainingForEvaFdRule::CheckRule(const ROSTER* roster, const Duty* duty, const Segment* segment, const std::shared_ptr<TmProgramCourse>& programCourse, const std::shared_ptr<CREW>& crew, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	auto tmProgram = tmProgramIndex->getById(programCourse->programId);
	if (tmProgram == nullptr) {
		Logger::getRuleLogger()->error("ERROR: invalid data, programId ({}) does not exist.", programCourse->programId);
		return true;
	}
	if (ruleParam.MatchParam(tmProgram, programCourse)) {
		auto matchedRoutes = ruleParam.MatchRoutes(segment);
		if (!matchedRoutes.empty()) {
			ThrowRuleViolation(programCourse, roster, duty, segment, matchedRoutes, ruleParam);
			valid = false;
		}
	}
	return valid;
}

void LimitULROnTrainingForEvaFdRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitULROnTrainingForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitULROnTrainingForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitULROnTrainingForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourse, const ROSTER* roster, const Duty* duty, const Segment* segment, const std::vector<std::string>& matchedRoutes, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const {
	string msg = "ULR routes ({0:routes}) are not allowed on training flights with course codes ({1:courseCodes}) on segment ({2:flightNum}).";
	msg = StringUtils::Format(msg, ruleParam._strRouteAttributes, ruleParam._strCourseCodes, segment->getFlightNumber());

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

	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->segmentId = segment->getDBId();
	rv->startDTUtc = segment->getStartTimeUtcAct();
	rv->endDTUtc = segment->getEndTimeUtcAct();

	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("programId", programCourse == nullptr ? "0" : std::to_string(programCourse->programId)));
	rv->operation_result.insert(pair<string, string>("programCourseId", programCourse == nullptr ? "0" : std::to_string(programCourse->id)));
	rv->operation_result.insert(pair<string, string>("footprintTypes", ruleParam._footprintTypes));
	rv->operation_result.insert(pair<string, string>("footprintSubtypes", ruleParam._footprintSubtypes));
	rv->operation_result.insert(pair<string, string>("courseCodes", ruleParam._strCourseCodes));
	rv->operation_result.insert(pair<string, string>("flightNum", segment->getFlightNumber()));
	rv->operation_result.insert(pair<string, string>("routeAttributes", ruleParam._strRouteAttributes));
	//rv->operation_result.insert(pair<string, string>("matchedRoutes", StringUtils::Join(matchedRoutes, ",")));
	_ruleViolation.AddRuleViolations(rv);
}
