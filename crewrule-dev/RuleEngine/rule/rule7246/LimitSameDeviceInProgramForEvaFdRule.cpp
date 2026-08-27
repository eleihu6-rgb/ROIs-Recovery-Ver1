/**
 * @file LimitSameDeviceInProgramForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitSameDeviceInProgramForEvaFdRule.h"
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

bool LimitSameDeviceInProgramForEvaFdRule::CheckRule(const std::shared_ptr<CREW>& crew) const {
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

	//按program分组，获得已排课的programCourse。返回值：map<programId, 培训计划program下已经排课的programCourse>
	map<long long, vector<std::shared_ptr<TmProgramCourse>>> programCourseMap = TrainingCourseUtils::GetProgramCourseInProgram(crew, this->GetDataContext());
	for (auto& pair : programCourseMap) {
		auto& programId = pair.first;
		auto& tmProgramCourseList = pair.second;
		if (tmProgramCourseList.size() <= 1) {
			continue;
		}
		for (const auto& ruleParam : _ruleParams) {
			if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
				continue;
			}
			_ruleViolation.SetRuleParam(ruleParam);

			bool valid = CheckRule(programId, tmProgramCourseList, crew, ruleParam);
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

bool LimitSameDeviceInProgramForEvaFdRule::CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const LimitSameDeviceInProgramForEvaFdRuleParam& ruleParam) const {
	bool valid = true;
	auto& tmProgram = _dbData->tmProgramIndex->getById(programId);
	if (tmProgram == nullptr) return true;
	auto& tmFootprint = _dbData->tmFootprintIndex->getById(tmProgram->footprintId);
	if (tmFootprint == nullptr) return true;

	if (!ruleParam.MatchFootprintType(tmFootprint)) {
		return true;
	}

	for (size_t i = 0; i < tmProgramCourseList.size() - 1; i++) {
		auto& programCourseA = tmProgramCourseList.at(i);
		for (size_t j = i + 1; j < tmProgramCourseList.size(); j++) {
			if (i == j) continue;
			auto& programCourseB = tmProgramCourseList.at(j);
			if (ruleParam.MatchParam(programCourseA, programCourseB, crew)) {
				if (!ruleParam.CheckParam(programCourseA, programCourseB)) {
					valid = false;

					_ruleViolation.SetParam("programId", StringUtils::lltos(tmProgram->id));
					_ruleViolation.SetParam("programName", tmProgram->name);
					_ruleViolation.SetParam("aProgramCourseId", StringUtils::lltos(programCourseA->id));
					_ruleViolation.SetParam("bProgramCourseId", StringUtils::lltos(programCourseB->id));

					ThrowRuleViolation(programCourseA, programCourseB, ruleParam);
				}
			}
		}
	}
	return valid;
}

void LimitSameDeviceInProgramForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitSameDeviceInProgramForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitSameDeviceInProgramForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitSameDeviceInProgramForEvaFdRule::ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const LimitSameDeviceInProgramForEvaFdRuleParam& ruleParam) const {
	string programId = _ruleViolation.GetParam("programId");
	string programName = _ruleViolation.GetParam("programName");
	string aProgramCourseId = _ruleViolation.GetParam("aProgramCourseId");
	string bProgramCourseId = _ruleViolation.GetParam("bProgramCourseId");

	//在训练计划中(XXX)，训练课程(XXX)必须使用同一种设备类型
	string msg = "In the program ({0:programName}), the course {1:courseCodes} must be used the same device group ({2:deviceGroups}).";
	msg = StringUtils::Format(msg, programName, ruleParam._courseCodes, ruleParam._strDeviceGroups);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = -1;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	}

	rv->pairingId = -1;
	rv->startDTUtc = programCourseA->startTime;
	rv->endDTUtc = programCourseB->endTime;

	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("programId", programId));
	rv->operation_result.insert(pair<string, string>("programName", programName));
	rv->operation_result.insert(pair<string, string>("courseCodes", ruleParam._courseCodes));
	rv->operation_result.insert(pair<string, string>("aProgramCourseId", aProgramCourseId));
	rv->operation_result.insert(pair<string, string>("bProgramCourseId", bProgramCourseId));
	_ruleViolation.AddRuleViolations(rv);
}