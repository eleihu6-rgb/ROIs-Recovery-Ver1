/**
 * @file RequiredMinNumOfCourseForEvaFdRuleParam.h
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
#include "RequiredMinNumOfCourseForEvaFdRuleParam.h"
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

void RequiredMinNumOfCourseForEvaFdRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::CREW_FLEETS): {
				_crewFleet = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _crewFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_SUB_TYPES): {
				_footprintSubtypes = substr;
				_footprintSubtypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_courseCodes = substr;
				_courseCodesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::BEGIN_REFERENCE_TIME): {
				_startReferenceTime = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::END_REFERENCE_TIME): {
				_endReferenceTime = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::BEGIN_DAY): {
				_beginDay = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::END_DAY): {
				_endDay = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::PERIOD): {
				_period = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::UNIT): {
				_unit = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_LIMITS_OF_COURSE): {
				_minLimitsOfCourse = atoi(substr.c_str());
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

void RequiredMinNumOfCourseForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Crew Fleets,Footprint Subtypes,Course Codes,Begin Reference Time(IOE/FDD),End Reference Time(IOE/FDD),Begin Day,End Day,Period,Unit,Min Limits of Course 
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
		else if (header == "CREW FLEETS") {
			_crewFleet = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewFleets);
			}
		}
		else if (header == "FOOTPRINT SUBTYPES") {
			_footprintSubtypes = headeValue;
			_footprintSubtypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "COURSE CODES") {
			_courseCodes = headeValue;
			_courseCodesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "BEGIN REFERENCE TIME(IOE/FDD)") {
			_startReferenceTime = strToUpper(headeValue);
		}
		else if (header == "END REFERENCE TIME(IOE/FDD)") {
			_endReferenceTime = strToUpper(headeValue);
		}
		else if (header == "BEGIN DAY") {
			_beginDay = atoi(headeValue.c_str());
		}
		else if (header == "END DAY") {
			_endDay = atoi(headeValue.c_str());
		}
		else if (header == "PERIOD") {
			_period = atoi(headeValue.c_str());
		}
		else if (header == "UNIT") {
			_unit = strToUpper(headeValue);
		}
		else if (header == "MIN LIMITS OF COURSE") {
			_minLimitsOfCourse = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool RequiredMinNumOfCourseForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool RequiredMinNumOfCourseForEvaFdRuleParam::MatchFootprintSubType(const std::shared_ptr<TmFootprint>& tmFootprint) const {

	if (!_footprintSubtypesMatch.Match(tmFootprint->footprintSubType)) {
		return false;
	}
	return true;
}

bool RequiredMinNumOfCourseForEvaFdRuleParam::MatchCrewFleets(const std::shared_ptr<CREW>& crew, const std::shared_ptr<TmProgramCourse>& programCourse) const {
	std::vector<string> bases, ranks, teams, positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, bases, ranks, this->_crewFleets, teams, positions, programCourse->startTime, programCourse->endTime))
		return true;
	return false;
}


bool RequiredMinNumOfCourseForEvaFdRuleParam::MatchCourseCode(const std::shared_ptr<TmProgramCourse>& programCourse) const {
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, this->GetRule()->GetDataContext());
	if (tmCourse == nullptr || !_courseCodesMatch.Match(tmCourse->courseCode)) {
		return false;
	}
	return true;
}