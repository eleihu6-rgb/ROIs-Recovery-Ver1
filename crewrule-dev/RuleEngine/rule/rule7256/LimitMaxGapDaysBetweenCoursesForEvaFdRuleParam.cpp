/**
 * @file LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"

using namespace std;

void LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_A_CODES): {
				_courseACodes = substr;
				_courseACodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_GAP_DAYS): {
				_maxGapDays = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_B_CODES): {
				_courseBCodes = substr;
				_courseBCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Course A Codes,Max Gap Days,Course B Codes
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "COURSE A CODES") {
			_courseACodes = headeValue;
			_courseACodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "MAX GAP DAYS") {
			_maxGapDays = atoi(headeValue.c_str());
		}
		else if (header == "COURSE B CODES") {
			_courseBCodes = headeValue;
			_courseBCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgramCourse>& programCourseA) const {
	auto& dbData = this->GetRule()->GetDataContext();

	auto tmCourseA = TrainingCourseUtils::GetCourseByCourseId(programCourseA->courseId, this->GetRule()->GetDataContext());
	if (tmCourseA == nullptr || !_courseACodesMatch.Match(tmCourseA->courseCode)) {
		return false;
	}
	return true;
}

bool LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam::CheckParam(const size_t startIndex, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const time_t limitStartTimeUtc, const time_t limitEndTimeUtc) const {
	bool valid = false;
	for (size_t i = startIndex; i < tmProgramCourseList.size(); i++) {
		auto& tmProgramCourseB = tmProgramCourseList.at(i);
		if (tmProgramCourseB->startTime >= limitStartTimeUtc && tmProgramCourseB->endTime <= limitEndTimeUtc) {
			auto tmCourseB = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourseB->courseId, this->GetRule()->GetDataContext());
			if (tmCourseB != nullptr && _courseBCodesMatch.Match(tmCourseB->courseCode)) {
				valid = true;
				break;
			}
		}
	}
	return valid;
}
