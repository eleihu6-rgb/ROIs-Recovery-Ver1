/**
 * @file LimitSameCourseCodeInDutyForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitSameCourseCodeInDutyForEvaFdRule.h"
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



bool LimitSameCourseCodeInDutyForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

bool LimitSameCourseCodeInDutyForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitSameCourseCodeInDutyForEvaFdRuleParam& ruleParam) const {
	bool passAllRule = true;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	for (auto& duty : roster->pairing->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			auto cofProgramCourseList = tmProgramCourseIndex->getByFlightId(segment->getDBId());
			for (auto& cofProgramCourse : cofProgramCourseList) {
				bool valid = CheckRule(roster, duty, segment, cofProgramCourse, crew, ruleParam);
				if (!valid) {
					passAllRule = false;
				}
			}
		}
	}
	return passAllRule;
}

bool LimitSameCourseCodeInDutyForEvaFdRule::CheckRule(const ROSTER* roster, const Duty* duty, const Segment* segment, const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<CREW>& crew, const LimitSameCourseCodeInDutyForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	auto& tmProgramIndex = this->_dbData->tmProgramIndex;
	auto& tmProgramCourseIndex = this->_dbData->tmProgramCourseIndex;
	auto& tmProgramCourseInstructorIndex = this->_dbData->tmProgramCourseInstructorIndex;

	auto tmProgram = tmProgramIndex->getById(cofProgramCourse->programId);
	if (tmProgram == nullptr) {
		Logger::getRuleLogger()->error("ERROR: invalid data, programId ({}) does not exist.", cofProgramCourse->programId);
		return true;
	}
	if (ruleParam.MatchParam(tmProgram, cofProgramCourse->courseId)) {
		auto tmProgramCourseList = tmProgramCourseIndex->getByFlightId(segment->getDBId());
		auto tmProgramCourseInstructorList = tmProgramCourseInstructorIndex->getByFlightId(segment->getDBId());

		if (IsSubCourse(tmProgramCourseList, tmProgramCourseInstructorList)) {
			return true;
		}

		set<long long> courseIdsOfSegment;//同一Segment内所有courseId集合
		for (auto& tmProgramCourse : tmProgramCourseList) {
			courseIdsOfSegment.emplace(tmProgramCourse->courseId);
		}

		for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
			courseIdsOfSegment.emplace(tmProgramCourseInstructor->courseId);
		}

		if (courseIdsOfSegment.size() > 1) {
			ThrowRuleViolation(roster, duty, segment, courseIdsOfSegment);
			valid = false;
		}
	}
	return valid;
}

bool LimitSameCourseCodeInDutyForEvaFdRule::IsSubCourse(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorList) const {
	set<string> teCrewIds;//学员Crew
	for (auto& tmProgramCourse : tmProgramCourseList) {
		teCrewIds.emplace(tmProgramCourse->crewId);
	}

	for (auto& tmProgramCourseInstructor : tmProgramCourseInstructorList) {
		auto& instructorCrewId = tmProgramCourseInstructor->crewId; //教员Crew
		if (teCrewIds.find(instructorCrewId) != teCrewIds.end()) {
			return true;
		}
	}
	return false;
}

void LimitSameCourseCodeInDutyForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitSameCourseCodeInDutyForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitSameCourseCodeInDutyForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitSameCourseCodeInDutyForEvaFdRule::ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const Segment* segment, const set<long long>& courseIdsOfSegment) const {
	set<string> courseCodes;
	for (auto courseId : courseIdsOfSegment) {
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(courseId, this->GetDataContext());
		if (tmCourse != nullptr) {
			courseCodes.emplace(tmCourse->courseCode);
		}
	}
	//在program中课程中，同一Segment内不能出现不同课程
	string msg = "Different courses ({0:courseCodes}) are not allowed in the same segment ({1:flightNum}).";
	msg = StringUtils::Format(msg, StringUtils::Join(courseCodes, ","), segment->getFlightNumber());

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

	rv->operation_result.insert(pair<string, string>("courseIds", StringUtils::Join(courseIdsOfSegment, ",")));
	rv->operation_result.insert(pair<string, string>("flightNum", segment->getFlightNumber()));
	_ruleViolation.AddRuleViolations(rv);


}