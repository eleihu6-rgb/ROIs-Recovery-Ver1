/**
 * @file LimitDependBetweenCoursesForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitDependBetweenCoursesForEvaFdRule.h"
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
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>

bool LimitDependBetweenCoursesForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
	if (this->_ruleParams.empty() || crew == nullptr) {
		return true;
	}

	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : crew->rosterList) {
		rosters.emplace_back(roster.get());
	}

	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER || rosters.empty())
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	bool passAllRule = true;
	bool next = true;
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	//检查课程间限制
	const auto rosterProgramCourseMap = TrainingCourseUtils::GetRosterProgramCourseGroupByProgramId(crew, this->GetDataContext());

	for (auto& pair : rosterProgramCourseMap) {
		auto& rosterProgramCourseList = pair.second;

		set<string> assignedCourseSeqs; //已经排课的课程序号
		for (auto& rosterProgramCourse : rosterProgramCourseList) {
			assignedCourseSeqs.emplace(rosterProgramCourse->programCourse->courseSeq);
		}
		for (std::size_t i = 0; i < rosterProgramCourseList.size(); i++) {
			std::shared_ptr<RosterProgramCourse> currRosterProgramCourse = rosterProgramCourseList[i];
			_ruleViolation.SetParam("rosterId", StringUtils::lltos(currRosterProgramCourse->programCourse->rosterId));
			bool valid = CheckRule(currRosterProgramCourse, rosterProgramCourseList, assignedCourseSeqs, crew);
			if (!valid) {
				passAllRule = false;
				if (!passAllRule) {
					if (!IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
	}
	return passAllRule;
}

//课程间强制关联关系
bool LimitDependBetweenCoursesForEvaFdRule::CheckRule(const std::shared_ptr<RosterProgramCourse>& currRosterProgramCourse, const vector<std::shared_ptr<RosterProgramCourse>>& allRosterProgramCourseList, const set<string>& assignedCourseSeqs, const std::shared_ptr<CREW>& crew) const {
	bool passAllRule = true;

	auto& tmProgramCourseIndex = _dbData->tmProgramCourseIndex;

	long long parentProgramCourseId = TrainingCourseUtils::GetProgramCourseParentId(currRosterProgramCourse->programCourse);
	auto parentProgramCourse = tmProgramCourseIndex->getById(parentProgramCourseId);
	if (parentProgramCourse == nullptr) {
		return true;
	}
	auto& dependencySeqs = parentProgramCourse->coursePrepositions;//获得依赖的前序计划课程序号列表
	//auto& dependencySeqs = currRosterProgramCourse->programCourse->coursePrepositions;//获得依赖的前序计划课程序号列表
	for (auto& dependencySeq : dependencySeqs) {
		if (assignedCourseSeqs.find(dependencySeq) == assignedCourseSeqs.end()) {
			passAllRule = false;
			ThrowRuleViolationForNotAssign(currRosterProgramCourse->programCourse, dependencySeq);
			continue;
		}

		bool valid = false;
		vector<std::shared_ptr<TmProgramCourse>> prepositionProgramCourseList;
		for (auto& otherRosterProgramCourse : allRosterProgramCourseList) {
			if (currRosterProgramCourse->programCourse->id == otherRosterProgramCourse->programCourse->id) {
				continue;
			}

			if (dependencySeq == otherRosterProgramCourse->programCourse->courseSeq) {
				if (otherRosterProgramCourse->programCourse->startTime < currRosterProgramCourse->programCourse->startTime) {
					valid = true;
					break;
				}
				else {
					prepositionProgramCourseList.emplace_back(otherRosterProgramCourse->programCourse);
				}
			}
		}

		if (!valid) {
			ThrowRuleViolation(currRosterProgramCourse->programCourse, prepositionProgramCourseList);
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

void LimitDependBetweenCoursesForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitDependBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitDependBetweenCoursesForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitDependBetweenCoursesForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& prepositionProgramCourseList) const {
	string programName;
	string curCourseId, currCourseCode;
	std::unordered_set<string> prepositionProgramCourseIds, prepositionCourseIds, prepositionCourseCodes;

	auto tmProgram = _dbData->tmProgramIndex->getById(currProgramCourse->programId);
	if (tmProgram != nullptr) {
		programName = tmProgram->name;
	}

	auto tmCurrCourse = TrainingCourseUtils::GetCourseByCourseId(currProgramCourse->courseId, this->GetDataContext());
	if (tmCurrCourse != nullptr) {
		currCourseCode = tmCurrCourse->courseCode;
		curCourseId = StringUtils::lltos(tmCurrCourse->id);
	}

	for (auto& prepositionProgramCourse : prepositionProgramCourseList) {
		auto tmCourseB = TrainingCourseUtils::GetCourseByCourseId(prepositionProgramCourse->courseId, this->GetDataContext());
		if (tmCourseB != nullptr) {
			prepositionProgramCourseIds.emplace(StringUtils::lltos(prepositionProgramCourse->id));
			prepositionCourseCodes.emplace(tmCourseB->courseCode);
			prepositionCourseIds.emplace(StringUtils::lltos(tmCourseB->id));
		}

	}

	//XXX训练计划的XXX训练课程开始前，必须完成前序课程
	// The sequence of course(M23) and course(M22) doesn't meet the requirements.
	std::string msg = "The sequence of course ({0:currCourseCode}) and course ({1:prepositionCourseCodes}) doesn't meet the requirements.";
	msg = StringUtils::Format(msg, currCourseCode, StringUtils::Join(prepositionCourseCodes, "|"));

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

	rv->pairingId = -1;
	rv->startDTUtc = currProgramCourse->startTime;
	rv->endDTUtc = currProgramCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(currProgramCourse->programId)));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("currProgramCourseId", StringUtils::lltos(currProgramCourse->id)));
	rv->operation_result.insert(pair<string, string>("prepositionProgramCourseIds", StringUtils::Join(prepositionProgramCourseIds, ",")));
	rv->operation_result.insert(pair<string, string>("curCourseId", curCourseId));
	rv->operation_result.insert(pair<string, string>("currCourseCode", currCourseCode));
	rv->operation_result.insert(pair<string, string>("prepositionCourseIds", StringUtils::Join(prepositionCourseIds, ",")));
	rv->operation_result.insert(pair<string, string>("prepositionCourseCodes", StringUtils::Join(prepositionCourseCodes, ",")));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitDependBetweenCoursesForEvaFdRule::ThrowRuleViolationForNotAssign(const std::shared_ptr<TmProgramCourse>& currProgramCourse, const string& dependencySeq) const {
	string programName;
	string currCourseId, currCourseCode, prepositionCourseId, prepositionCourseCode;

	auto tmProgram = _dbData->tmProgramIndex->getById(currProgramCourse->programId);
	if (tmProgram != nullptr) {
		programName = tmProgram->name;
	}

	auto tmCurrCourse = TrainingCourseUtils::GetCourseByCourseId(currProgramCourse->courseId, this->GetDataContext());
	if (tmCurrCourse != nullptr) {
		currCourseCode = tmCurrCourse->courseCode;
		currCourseId = StringUtils::lltos(tmCurrCourse->id);
	}

	auto prepositionProgramCourse = _dbData->tmProgramCourseIndex->getRootByProgramId(currProgramCourse->programId, dependencySeq);
	if (prepositionProgramCourse != nullptr) {
		auto tmPrepositionCourse = TrainingCourseUtils::GetCourseByCourseId(prepositionProgramCourse->courseId, this->GetDataContext());
		if (tmPrepositionCourse != nullptr) {
			prepositionCourseCode = tmPrepositionCourse->courseCode;
			prepositionCourseId = StringUtils::lltos(tmPrepositionCourse->id);
		}
	}
	else {
		Logger::getRuleLogger()->debug("[ERROR] preposition program course is null. programId={}, dependencySeq={}.", currProgramCourse->programId, dependencySeq);
	}

	//XXX训练计划的XXX训练课程开始前，必须完成前序课程
	// The sequence of course(M23) and course(M22) doesn't meet the requirements.
	std::string msg = "The sequence of course ({0:currCourseCode}) and course ({1:prepositionCourseCode}) doesn't meet the requirements.";
	msg = StringUtils::Format(msg, currCourseCode, prepositionCourseCode);

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

	rv->pairingId = -1;
	rv->startDTUtc = currProgramCourse->startTime;
	rv->endDTUtc = currProgramCourse->endTime;
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", StringUtils::lltos(currProgramCourse->programId)));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("currProgramCourseId", StringUtils::lltos(currProgramCourse->id)));
	rv->operation_result.insert(pair<string, string>("prepositionProgramCourseId", prepositionProgramCourse == nullptr ? "-1" : StringUtils::lltos(prepositionProgramCourse->id)));
	rv->operation_result.insert(pair<string, string>("currCourseId", currCourseId));
	rv->operation_result.insert(pair<string, string>("currCourseCode", currCourseCode));
	rv->operation_result.insert(pair<string, string>("prepositionCourseId", prepositionCourseId));
	rv->operation_result.insert(pair<string, string>("prepositionCourseCode", prepositionCourseCode));

	_ruleViolation.AddRuleViolations(rv);
}