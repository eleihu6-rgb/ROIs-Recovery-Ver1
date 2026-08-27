/**
 * @file LimitULROnTrainingForEvaFdRuleParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-15
**/

#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitULROnTrainingForEvaFdRuleParam.h"
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
#include "../utils/SegmentUtils.h"

using namespace std;

void LimitULROnTrainingForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::FOOTPRINT_TYPES): {
				_footprintTypes = substr;
				_footprintTypeMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FOOTPRINT_SUB_TYPES): {
				_footprintSubtypes = substr;
				_footprintSubtypesMatch.SetExpression(strToUpper(substr), this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::IOE_PHASE): {
				_strIOEPhases = substr;	
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _ioePhases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_strCourseCodes = substr;	
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _courseCodes);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ROUTES): {
				_strRouteAttributes = substr;	
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _routeAttributes);
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

void LimitULROnTrainingForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	//Footprint Types,Footprint Subtypes,IOE Phase,Course Codes,Routes
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "FOOTPRINT TYPES") {
			_footprintTypes = headeValue;
			_footprintTypeMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "FOOTPRINT SUBTYPES") {
			_footprintSubtypes = headeValue;
			_footprintSubtypesMatch.SetExpression(strToUpper(headeValue), this->GetRule());
		}
		else if (header == "IOE PHASE" || header == "IOE PHASES") {
			_strIOEPhases = headeValue;	
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ioePhases);
			}
		}
		else if (header == "COURSE CODES") {
			_strCourseCodes = headeValue;	
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _courseCodes);
			}
		}
		else if (header == "ROUTES" || header == "ROUTE ATTRIBUTES") {
			_strRouteAttributes = headeValue;	
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _routeAttributes);
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitULROnTrainingForEvaFdRuleParam::MatchFootprintType(const std::shared_ptr<TmProgram>& tmProgram) const {
	auto& dbData = this->GetRule()->GetDataContext();

	auto tmFootprint = dbData->tmFootprintIndex->getById(tmProgram->footprintId);
	if (tmFootprint != nullptr && !_footprintTypeMatch.Match(tmFootprint->footprintType)) {
		return false;
	}

	if (tmFootprint != nullptr && !_footprintSubtypesMatch.Match(tmFootprint->footprintSubType)) {
		return false;
	}

	return true;
}

bool LimitULROnTrainingForEvaFdRuleParam::MatchIOEPhase(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	if (_ioePhases.empty()) {
		return true;
	}
	return (tmProgramCourse->simioe == "IOE") && find(_ioePhases.begin(), _ioePhases.end(), tmProgramCourse->coursePhase) != _ioePhases.end();
}

bool LimitULROnTrainingForEvaFdRuleParam::MatchCourseCode(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	if (_courseCodes.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(tmProgramCourse->courseId, dbData);
	if (tmCourse == nullptr) {
		return false;
	}
	return find(_courseCodes.begin(), _courseCodes.end(), tmCourse->courseCode) != _courseCodes.end();
}

bool LimitULROnTrainingForEvaFdRuleParam::MatchParam(const std::shared_ptr<TmProgram>& tmProgram, const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const {
	auto& dbData = this->GetRule()->GetDataContext();
	if (tmProgram == nullptr || tmProgramCourse == nullptr) {
		return false;
	}

	if (!MatchFootprintType(tmProgram)) {
		return false;
	}

	if (!MatchIOEPhase(tmProgramCourse)) {
		return false;
	}

	if (!MatchCourseCode(tmProgramCourse)) {
		return false;
	}
	return true;
}

vector<string> LimitULROnTrainingForEvaFdRuleParam::MatchRoutes(const Segment* segment) const {
	if (_routeAttributes.empty()) {
		return vector<string>();
	}

	vector<string> matchedRoutes;
	const auto& attributeMap = this->GetRule()->GetDataContext()->attributeIdMap;
	for (auto& route : this->GetRule()->GetDataContext()->routeList) {
		if (route->arvArp != "" && route->arvArp != segment->getArrStation())
			continue;
		if (route->depArp != "" && route->depArp != segment->getDepStation())
			continue;
		if (route->fltNum != "" && route->fltNum != segment->getFlightNumber())
			continue;
		
		if ((route->flt_dt_start != -1 && route->flt_dt_start > segment->getStartTimeLocAct()) || (route->flt_dt_end != -1 && route->flt_dt_end < segment->getEndTimeLocAct())) {
			continue;
		}
		if (route->segType != "" && route->segType != "*" && route->segType != segment->getDomIntType() && (route->flt_dt_start > segment->getStartTimeLocAct() || route->flt_dt_end < segment->getEndTimeLocAct()))
			continue;
		
		if (attributeMap.find(route->routeId) == attributeMap.end())
			continue;
		if (find(_routeAttributes.begin(), _routeAttributes.end(), attributeMap.at(route->routeId).code) != _routeAttributes.end()) {
			matchedRoutes.push_back(attributeMap.at(route->routeId).code);
		}
	}
	return matchedRoutes;
}
