#include "CheckTrainingBriefAndDebriefForEvaFdRule.h"
#include <cfloat>
#include <algorithm>

#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"

bool CheckTrainingBriefAndDebriefForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	auto iterCrew = this->_dbData->crewIdMap.find(rosters[0]->idcrew);
	if (iterCrew == this->_dbData->crewIdMap.end() || iterCrew->second == nullptr) {
		return true;
	}

	std::shared_ptr<CREW> crew = iterCrew->second;
	string crewBase = crew->getPrimeBase();
	
	_ruleViolation.SetRuleParam(_ruleParams[0]);
	_ruleViolation.SetParam("crewId", crew->idCrew);

	bool passAllRule = true;
	for (auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		_ruleViolation.SetParam("rosterId", StringUtils::lltos(roster->rosterId));
		if (!CheckRule(roster, crew)) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

void CheckTrainingBriefAndDebriefForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(TrainingBriefAndDebriefForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(TrainingBriefAndDebriefForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool CheckTrainingBriefAndDebriefForEvaFdRule::CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	for (const auto& duty : roster->pairing->getDutyVec()) {
		if (!CheckRule(roster, duty, crew)) {
			valid = false;
		}
	}
	return valid;
}

bool CheckTrainingBriefAndDebriefForEvaFdRule::CheckRule(const ROSTER* roster, const Duty* duty, const std::shared_ptr<CREW>& crew) const {
	bool valid = true;
	int prevSegRequiredBriefMinutes = -1, prevSegRequiredDebriefMinutes = -1;//前一个SIM Segment的需要的签到和签出
	long long prevCourseId = -1;
	string prevCrewRole = "";

	shared_ptr<PairingDutyNode> simBrief = nullptr, simDebrief = nullptr;
	bool isCheckedBrief = false, isCheckedDebrief = false;//是否已经检查签到和签出时间

	for (size_t i = 0; i < duty->getNumSegments(); i++) {
		const Segment* currSegment = duty->getSegment(i);

		auto tmProgramCourse = this->_dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, currSegment->getDBId());
		if (tmProgramCourse != nullptr) {
			auto tmProgram = this->_dbData->tmProgramIndex->getById(tmProgramCourse->programId);
            string role = (tmProgram != nullptr && tmProgram->isSoloCourse()) ? (tmProgramCourse->role.empty() ? "TE" : tmProgramCourse->role) : "TE";
			auto [requiredBriefMinutes, requiredDebriefMinutes] = GetCourseBriefAndDebrief(tmProgramCourse->courseId, role);

			if (simBrief == nullptr && simDebrief == nullptr) {
				SegmentUtils::GetBriefAndDebriefOfSIM(simBrief, simDebrief, duty, currSegment->getDBId());
			}
			if (!isCheckedBrief && simBrief != nullptr) {
				isCheckedBrief = true;
				int actualBriefMin = static_cast<int>((simBrief->getEndUtc() - simBrief->getStartUtc()) / 60);
				//手工修改签到时间,则不在检查
				if (!simBrief->getIsManualModify() && requiredBriefMinutes > 0 && actualBriefMin != requiredBriefMinutes) {
					valid = false;
					ThrowRuleViolationForBrief(roster, role, tmProgramCourse->courseId, requiredBriefMinutes, actualBriefMin);
				}
			}

			prevSegRequiredBriefMinutes = requiredBriefMinutes;
			prevSegRequiredDebriefMinutes = requiredDebriefMinutes;
			prevCourseId = tmProgramCourse->courseId;
			prevCrewRole = role;
		}

		auto tmProgramCourseInstructor = this->_dbData->tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId, currSegment->getDBId());
		if (tmProgramCourseInstructor != nullptr) {
			auto [requiredBriefMinutes, requiredDebriefMinutes] = GetCourseBriefAndDebrief(tmProgramCourseInstructor->courseId, tmProgramCourseInstructor->role);

			if (simBrief == nullptr && simDebrief == nullptr) {
				SegmentUtils::GetBriefAndDebriefOfSIM(simBrief, simDebrief, duty, currSegment->getDBId());
			}
			if (!isCheckedBrief && simBrief != nullptr) {
				isCheckedBrief = true;
				int actualBriefMin = static_cast<int>((simBrief->getEndUtc() - simBrief->getStartUtc()) / 60);
				//手工修改签到时间,则不在检查
				if (!simBrief->getIsManualModify() && requiredBriefMinutes > 0 && actualBriefMin != requiredBriefMinutes) {
					valid = false;
					ThrowRuleViolationForBrief(roster, tmProgramCourseInstructor->role, tmProgramCourseInstructor->courseId, requiredBriefMinutes, actualBriefMin);
				}
			}

			prevSegRequiredBriefMinutes = requiredBriefMinutes;
			prevSegRequiredDebriefMinutes = requiredDebriefMinutes;
			prevCourseId = tmProgramCourseInstructor->courseId;
			prevCrewRole = tmProgramCourseInstructor->role;
		}

		if (tmProgramCourse == nullptr && tmProgramCourseInstructor == nullptr) {
			//当Crew以学员和教员连续混排，“学员段”和“教员段”合并在一起设置Brief和Debrief。 SIM Segment Debrief为最后一个课程Debrief（可能是教员也可能是学员）
			if (isCheckedBrief && simDebrief != nullptr) {
				isCheckedDebrief = true;
				int actualDebriefMin = static_cast<int>((simDebrief->getEndUtc() - simDebrief->getStartUtc()) / 60);
				//手工修改签出时间,则不在检查
				if (!simDebrief->getIsManualModify() && prevSegRequiredDebriefMinutes > 0 && actualDebriefMin != prevSegRequiredDebriefMinutes) {
					valid = false;
					ThrowRuleViolationForDebrief(roster, prevCrewRole, prevCourseId, prevSegRequiredDebriefMinutes, actualDebriefMin);
				}
			}

		}
	}

	if (isCheckedBrief && !isCheckedDebrief) {
		if (simDebrief != nullptr) {
			isCheckedDebrief = true;
			int actualDebriefMin = static_cast<int>((simDebrief->getEndUtc() - simDebrief->getStartUtc()) / 60);
            //手工修改签出时间,则不在检查
			if (!simDebrief->getIsManualModify() && prevSegRequiredDebriefMinutes > 0 && actualDebriefMin != prevSegRequiredDebriefMinutes) {
				valid = false;
				ThrowRuleViolationForDebrief(roster, prevCrewRole, prevCourseId, prevSegRequiredDebriefMinutes, actualDebriefMin);
			}
		}
	}
	return valid;
}

std::tuple<int,int> CheckTrainingBriefAndDebriefForEvaFdRule::GetCourseBriefAndDebrief(const long long courseId, const string& role) const {
	int briefMinutes = -1, debriefMinutes = -1;
	auto tmCourseBriefList = this->_dbData->tmCourseBriefIndex->getByCourseId(courseId);
	for (auto& tmCourseBrief : tmCourseBriefList) {
		if (std::find(tmCourseBrief->briefRoles.begin(), tmCourseBrief->briefRoles.end(), role) != tmCourseBrief->briefRoles.end()) {
			if (tmCourseBrief->briefType == 1) {
				briefMinutes = tmCourseBrief->briefTimes;
			}
			else if (tmCourseBrief->briefType == 2) {
				debriefMinutes = tmCourseBrief->briefTimes;
			}
		}
	}
	return std::make_tuple(briefMinutes, debriefMinutes);
}

void CheckTrainingBriefAndDebriefForEvaFdRule::ThrowRuleViolationForBrief(const ROSTER* roster, const string& crewRole, const long long courseId, const int requiredBriefMinutes, const int actualBriefMin) const {
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(courseId, _dbData);
	string courseCode = tmCourse == nullptr ? "N/A" : tmCourse->courseCode;
	string requiredBriefMinutesHHmm = requiredBriefMinutes < 0 ? "00:00" : TimeUtils::MinutesTohhmm(requiredBriefMinutes);
	string actualBriefMinHHmm = actualBriefMin < 0 ? "00:00" : TimeUtils::MinutesTohhmm(actualBriefMin);

	//X课程X角色的签到时间与需求不一致
	string msg = "The brief time for role ({0:role}) in course ({1:courseCode}) ({2:actualBriefMin}) doesn't meet the requirement ({3:requiredBriefMinutes}).";
	msg = StringUtils::Format(msg, crewRole, courseCode, actualBriefMinHHmm, requiredBriefMinutesHHmm);

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
	rv->operation_result.insert(pair<string, string>("role", crewRole));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("requiredBriefMinutes", requiredBriefMinutesHHmm));
	rv->operation_result.insert(pair<string, string>("actualBriefMin", actualBriefMinHHmm));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckTrainingBriefAndDebriefForEvaFdRule::ThrowRuleViolationForDebrief(const ROSTER* roster, const string& crewRole, const long long courseId, const int requiredDebriefMinutes, const int actualDebriefMin) const {
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(courseId, _dbData);
	string courseCode = tmCourse == nullptr ? "N/A" : tmCourse->courseCode;
	string requiredDebriefMinutesHHmm = requiredDebriefMinutes < 0 ? "00:00" : TimeUtils::MinutesTohhmm(requiredDebriefMinutes);
	string actualDebriefMinHHmm = actualDebriefMin < 0 ? "00:00" : TimeUtils::MinutesTohhmm(actualDebriefMin);

	//X课程X角色的签出时间与需求不一致
	string msg = "The debrief time for role ({0:role}) in course ({1:courseCode}) ({2:actualDebriefMin}) doesn't meet the requirement ({3:requiredDebriefMinutes}).";
	msg = StringUtils::Format(msg, crewRole, courseCode, actualDebriefMinHHmm, requiredDebriefMinutesHHmm);

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
	rv->operation_result.insert(pair<string, string>("role", crewRole));
	rv->operation_result.insert(pair<string, string>("courseCode", courseCode));
	rv->operation_result.insert(pair<string, string>("requiredDebriefMinutes", requiredDebriefMinutesHHmm));
	rv->operation_result.insert(pair<string, string>("actualDebriefMin", actualDebriefMinHHmm));
	_ruleViolation.AddRuleViolations(rv);
}