/**
 * @file LimitInexpCrewForEvaFdRuleParam.h
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
#include "LimitInexpCrewForEvaFdRuleParam.h"
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

void LimitInexpCrewForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::ACTING_RANKS): {
				_actingRanks = substr;
				_actingRanksMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DAYS_AFTER_FIRST_DUTY): {
				_daysAfterFirstDuty = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
				break;
			}
			case enum_to_underlying(ParamLocation::PROGRAM_STATUSES): {
				_programStatuses = substr;
				_programStatusMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPE): {
				_footprintType = substr;
				_footprintTypeMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_SUBTYPES): {
				_footprintSubtypes = substr;
				_footprintSubtypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_NUMBER_OF_INEXPERIENCED_CREW): {
				_maxNumOfCrew = atoi(substr.c_str());
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

void LimitInexpCrewForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Acting Ranks,Days After First Duty,Footprint Type,Footprint Subtypes,Program Statuses,Max Number of Inexperienced Crew
		if (header == "ACTING RANKS") {
			_actingRanks = header;
			_actingRanksMatch.SetExpression(strToUpper(header), this->GetRule());
		}
		else if (header == "DAYS AFTER FIRST DUTY") {
			_daysAfterFirstDuty = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
		}
		else if (header == "PROGRAM STATUSES") {
			_programStatuses = headeValue;
			_programStatusMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "FOOTPRINT TYPE") {
			_footprintType = headeValue;
			_footprintTypeMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "FOOTPRINT SUBTYPES") {
			_footprintSubtypes = headeValue;
			_footprintSubtypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "MAX NUMBER OF INEXPERIENCED CREW") {
			_maxNumOfCrew = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitInexpCrewForEvaFdRuleParam::MatchDaysAfterFirstDuty(const Segment* segment, const std::shared_ptr<CrewOnFlight>& cof) const {
	if (_daysAfterFirstDuty == nullptr) {
		return true;
	}

	auto& dbData = this->GetRule()->GetDataContext();
	auto tmPrograms = dbData->tmProgramIndex->getByCrewId(cof->crewId);

	auto maxProgram = std::max_element(tmPrograms.begin(), tmPrograms.end(), [](std::shared_ptr<TmProgram>& a, std::shared_ptr<TmProgram>& b) {
		return a->startDate > b->startDate;
	});
	if (maxProgram == tmPrograms.end()) {
		//无培训计划
		return false;
	}

	auto iterCrew = dbData->crewIdMap.find(cof->crewId);
	if (iterCrew == dbData->crewIdMap.end()) {
		return false;
	}
	string crewBase = cof->crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(segment->getStartTimeUtcAct(), crewBase, dbData);

	int days = TimeUtils::DiffCalendarDay((*maxProgram)->startDate, segment->getStartTimeUtcAct() + (time_t)60 * offsetTZMinutes);
	return (days < *_daysAfterFirstDuty);
}

bool LimitInexpCrewForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const std::shared_ptr<CrewOnFlight>& cof) const {

	auto& dbData = this->GetRule()->GetDataContext();

	//当前crew以学员维度检查（针对未训完，因此仅需要从学员维度检查）
	auto tmProgramCourseList = dbData->tmProgramCourseIndex->getByCrewId(cof->crewId);
	if (tmProgramCourseList.empty()) {
		//学员无课程，则不用检查该规则
		return false;
	}
	for (auto& tmProgramCourse : tmProgramCourseList) {
		if (!MatchProgramStatusAndFootprintType(tmProgramCourse)) {
			return false;
		}
	}
	return true;
}

bool LimitInexpCrewForEvaFdRuleParam::MatchProgramStatusAndFootprintType(const std::shared_ptr<TmProgramCourse>& teProgramCourse) const {
	auto& dbData = this->GetRule()->GetDataContext();
	const auto program = dbData->tmProgramIndex->getById(teProgramCourse->programId);
	if (program == nullptr) {
		Logger::getRuleLogger()->error("[MatchProgramStatusAndFootprintType] program is null. programCourseId={}, programId={}", teProgramCourse->id, teProgramCourse->programId);
		return false;
	}
	if (!_programStatusMatch.Match(program->status)) {
		return false;
	}
	
	auto tmFootprint = dbData->tmFootprintIndex->getById(program->footprintId);
	if (tmFootprint != nullptr && !_footprintTypeMatch.Match(tmFootprint->footprintType) && !_footprintSubtypesMatch.Match(tmFootprint->footprintSubType)) {
		return false;
	}
	return true;
}

bool LimitInexpCrewForEvaFdRuleParam::MatchParam(const Segment* segment, const std::shared_ptr<CrewOnFlight>& cof) const {
	auto& dbData = this->GetRule()->GetDataContext();

	if (!_actingRanksMatch.Match(cof->actingRank)) {
		return false;
	}

	if (!MatchDaysAfterFirstDuty(segment, cof)) {
		return false;
	}

	if (!MatchProgramStatusAndFootprintType(cof)) {
		return false;
	}
	return true;
}

