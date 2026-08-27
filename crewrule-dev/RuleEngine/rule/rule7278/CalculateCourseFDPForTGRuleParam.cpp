/**
 * @file CalculateCourseFDPForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateCourseFDPForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "index/TmProgramIndex.h"
#include "utils/TrainingCourseUtils.h"

using namespace std;

void CalculateCourseFDPForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "COURSES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _courses);
			}
		}
		else if (header == "FDP PCT") {
			if (headeValue != RuleParamConstant::ALL) {
				_fdpPct = stod(headeValue.c_str());
			}
		}
		else if (header == "BEFORE PCT FDP GAP") {
			if (headeValue == "0")
				_beforePctFdpGap = 0;
			else if (headeValue != RuleParamConstant::ALL) {
				_beforePctFdpGap = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "AFTER PCT FDP GAP") {
			if (headeValue == "0")
				_afterPctFdpGap = 0;
			else if (headeValue != RuleParamConstant::ALL) {
				_afterPctFdpGap = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateCourseFDPForTGRuleParam::MatchCourse(const SharedPtr<ROSTER>& roster) const {

	if (_courses.empty() || _courses[0] == "" || _courses[0] == "*")
		return true;

	const auto& tmProgramCourseIndex = this->GetRule()->GetDataContext()->tmProgramCourseIndex;
	const auto& tmProgramCourseInstructorIndex = this->GetRule()->GetDataContext()->tmProgramCourseInstructorIndex;

	if (!roster->pairing) {
		if (tmProgramCourseIndex) {
			const auto& programCourses = tmProgramCourseIndex->getByRosterId(roster->rosterId);

			for (const auto& programCourse : programCourses) {
				const auto& tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetRule()->GetDataContext());
				if (tmCourse == nullptr)
					continue;
				if (find(_courses.begin(), _courses.end(), tmCourse->courseCode) != _courses.end()) {
					return true;
				}
			}
		}
		
		if (tmProgramCourseInstructorIndex) {
			const auto& programCourseInstructors = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId);

			for (const auto& programCourseInstructor : programCourseInstructors) {
				const auto& tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourseInstructor->courseId, this->GetRule()->GetDataContext());
				if (tmCourse == nullptr)
					continue;
				if (find(_courses.begin(), _courses.end(), tmCourse->courseCode) != _courses.end()) {
					return true;
				}
			}
		}
		
	}
	else {
		const auto& segments = roster->pairing->getSegmentsRead();
		for (const auto& segment : segments) {
			if (tmProgramCourseIndex) {
				const auto& tmProgramCourse = tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
				if (tmProgramCourse == nullptr)
					continue;
				const auto& tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, this->GetRule()->GetDataContext());
				if (tmCourse == nullptr)
					continue;
				if (find(_courses.begin(), _courses.end(), tmCourse->courseCode) != _courses.end()) {
					return true;
				}
			}

			if (tmProgramCourseInstructorIndex) {
				const auto& programCourseInstructor = tmProgramCourseInstructorIndex->getByRosterId(roster->rosterId, segment->getDBId());
				if (programCourseInstructor == nullptr)
					continue;
				const auto& tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourseInstructor->courseId, this->GetRule()->GetDataContext());
				if (tmCourse == nullptr)
					continue;
				if (find(_courses.begin(), _courses.end(), tmCourse->courseCode) != _courses.end()) {
					return true;
				}
			}
		}
	}

	return false;
}

long CalculateCourseFDPForTGRuleParam::GetRosterGroundFDP(const SharedPtr<ROSTER>& roster) const {
	long duration = (long)(roster->getEndTimeUtcAct() - roster->getStartTimeUtcAct());
	
	return static_cast<long>(((duration + (long)_beforePctFdpGap * 60) * _fdpPct + _afterPctFdpGap * 60) / 60);
}

long CalculateCourseFDPForTGRuleParam::GetDutyFDP(const Duty* duty) const {
	
	const auto& brief = duty->getFirstBreif();
	const auto& debrief = duty->getLastDebrief();

	long fdp = 0;
	fdp += (long)(brief->getEndTimeUtcAct() - brief->getStartTimeUtcAct());
	fdp += (long)(debrief->getEndTimeUtcAct() - debrief->getStartTimeUtcAct());

	long duration = 0;
	const auto& segments = duty->getSegmentsRead();
	for (size_t i = 0; i < segments.size(); i++) {
		duration += (long)(segments[i]->getEndTimeUtcAct() - segments[i]->getStartTimeUtcAct());
		if (i != 0) {
			fdp += (long)(segments[i]->getStartTimeUtcAct() - segments[i - 1]->getEndTimeUtcAct());
		}
	}

	fdp += (long)((duration + (long)_beforePctFdpGap * 60) * _fdpPct + _afterPctFdpGap * 60);

	return  fdp / 60;


}