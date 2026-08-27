/**
 * @file LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam.h
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
#include "LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam.h"
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

void LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_courseCodes = substr;
				_courseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_LOCAL_DATES): {
				_strCourseLocalDates = substr;
				std::vector<std::string> splitstrs;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', splitstrs);
					for (auto& splitstr : splitstrs) {
						time_t date = utcStrToUtc((char*)splitstr.c_str());
						_courseLocalDates.emplace(date);
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::NUMBER_OF_DAYS): {
				_dayNums = (substr == RuleParamConstant::ALL) ? 1 : atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::PEOPLE_NUMBER_RANGE): {
				_peopleNumberRange = substr;

				vector<string> splitstrs;
				split(_peopleNumberRange.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_peopleNumberLower = atoi(splitstrs[0].c_str());
					_peopleNumberUpper = atoi(splitstrs[1].c_str());
				}
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

void LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	//Course Codes,Course Local Dates,Number of Days,Number Range
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
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
		else if (header == "COURSE CODES") {
			_courseCodes = headeValue;
			_courseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "COURSE LOCAL DATES") {
			_strCourseLocalDates = headeValue;
			std::vector<std::string> splitstrs;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', splitstrs);
				for (auto& splitstr : splitstrs) {
					time_t date = utcStrToUtc((char*)splitstr.c_str());
					_courseLocalDates.emplace(date);
				}
			}
		}
		else if (header == "NUMBER OF DAYS") {
			_dayNums = (headeValue == RuleParamConstant::ALL) ? 1 : atoi(headeValue.c_str());
		}
		else if (header == "NUMBER RANGE") {
			_peopleNumberRange = headeValue;

			vector<string> splitstrs;
			split(_peopleNumberRange.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_peopleNumberLower = atoi(splitstrs[0].c_str());
				_peopleNumberUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

std::set<long long> LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::GetCourseIds(const string& courseCodes) const {
	std::set<long long> results;
	auto& dbData = this->GetRule()->GetDataContext();

	std::vector<std::string> courseCodeList;
	split(courseCodes, '|', courseCodeList);

	for (auto& course : dbData->tmCourseList) {
		if (std::find(courseCodeList.begin(), courseCodeList.end(), course->courseCode) != courseCodeList.end()) {
			results.emplace(course->id);
		}
	}
	return results;
}

bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::MatchCourseLocalDates(std::set<time_t>& requiredCourseLocalDates, const std::shared_ptr<TmProgramCourse>& programCourse, const int offsetTZMinutes) const {
	bool matched = false;
	time_t startLocalDay = TimeUtils::GetStartTimeOfDay(programCourse->startTime + (time_t)offsetTZMinutes * 60);
	time_t endLocalDay = TimeUtils::GetStartTimeOfDay(programCourse->endTime + (time_t)offsetTZMinutes * 60);
	for (auto& courseLocalDate : this->_courseLocalDates) {
		if (courseLocalDate == startLocalDay) {
			requiredCourseLocalDates.emplace(courseLocalDate);
			matched = true;
		}

		if (courseLocalDate == endLocalDay) {
			requiredCourseLocalDates.emplace(courseLocalDate);
			matched = true;
		}
	}
	return matched;
}

bool LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam::MatchParam(std::set<time_t>& requiredCourseLocalDates, const std::shared_ptr<TmProgramCourse>& programCourse, const int offsetTZMinutes) const {
	auto& dbData = this->GetRule()->GetDataContext();

	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetRule()->GetDataContext());
	if (tmCourse == nullptr || !(_courseCodesMatch.Match(tmCourse->courseCode))) {
		return false;
	}

	if (!MatchCourseLocalDates(requiredCourseLocalDates, programCourse, offsetTZMinutes)) {
		return false;
	}
	return true;
}


