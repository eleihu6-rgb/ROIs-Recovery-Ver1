/**
 * @file CheckIOEPhaseFlightCompositionRuleParam.h
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
#include "CheckIOEPhaseFlightCompositionRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CheckIOEPhaseFlightCompositionRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ROUTES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _routes);
			}
		}
		else if (header == "CREW ROLES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _crewRoles);
			}
		}
		else if (header == "ACTING RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _actingRanks);
			}
		}
		else if (header == "FOOTPRINT TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(strToUpper(headeValue), '|', _footprintTypes);
			}
		}
		else if (header == "SUB FOOTPRINT TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(strToUpper(headeValue), '|', _subFootprintTypes);
			}
		}
		else if (header == "IOE PHASE") {
			if (headeValue != RuleParamConstant::ALL) {
				_ioePhase = headeValue;
			}
		}
		else if (header == "COURSE CODES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _courseCodes);
			}
		}
		else if (header == "MIN COMPOSITION WITHOUT TE") {
			if (headeValue != RuleParamConstant::ALL) {
				std::vector<std::string> list;
				split(headeValue, '|', list);
				for (const auto& comp : list) {
					map<std::string, int> compMap;
					std::vector<std::string> rankList;
					split(comp, '+', rankList);
					for (const auto& rank : rankList) {
						std::vector<std::string> value;
						split(rank, ':', value);
						if (value.empty() || value.size() != 2)
							continue;
						int rankValue = stoi(value[1]);
						if (rankValue != 0) 
							compMap[value[0]] = rankValue;
					}
					_minCompositionWithoutTE.push_back(compMap);
				}
				
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckIOEPhaseFlightCompositionRuleParam::MatchRosterFlight(const shared_ptr<RosterFlight>& rosterFlight) const {
	if (!_crewRoles.empty() && _crewRoles[0] != "*" && find(_crewRoles.begin(), _crewRoles.end(), rosterFlight->tmRole) == _crewRoles.end())
		return false;

	if (!_actingRanks.empty() && _actingRanks[0] != "*" && find(_actingRanks.begin(), _actingRanks.end(), rosterFlight->actingRank) == _actingRanks.end())
		return false;

	return true;
}


bool CheckIOEPhaseFlightCompositionRuleParam::MatchFlight(const Segment* segment) const {
	if (_routes.empty() || _routes[0] == "*")
		return true;

	bool matchRoute = false;
	const auto & attributeMap = this->GetRule()->GetDataContext()->attributeIdMap;
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
		if (find(_routes.begin(), _routes.end(), attributeMap.at(route->routeId).code) != _routes.end()) {
			matchRoute = true;
			break;
		}
	}
	return matchRoute;
}

bool CheckIOEPhaseFlightCompositionRuleParam::MatchTraining(const shared_ptr<RosterFlight>& rosterFlight) const {
	auto& tmProgramCourseIndex = this->GetRule()->GetDataContext()->tmProgramCourseIndex;
	const auto& rosterProgramCourse = tmProgramCourseIndex->getByRosterId(rosterFlight->rosterId, rosterFlight->fltId);
	if (!rosterProgramCourse)
		return false;
	auto& tmProgramIndex = this->GetRule()->GetDataContext()->tmProgramIndex;
	const auto& rosterProgram = tmProgramIndex->getById(rosterProgramCourse->programId);
	if (!rosterProgram)
		return false;
	auto& tmFootprintIndex = this->GetRule()->GetDataContext()->tmFootprintIndex;
	const auto& rosterFootprint = tmFootprintIndex->getById(rosterProgram->footprintId);
	if (rosterFootprint == nullptr) {
		return false;
	}
	if (!_footprintTypes.empty() && _footprintTypes[0] != "*" && find(_footprintTypes.begin(), _footprintTypes.end(), rosterFootprint->footprintType) == _footprintTypes.end()) {
		return false;
	}
	if (!_subFootprintTypes.empty() && _subFootprintTypes[0] != "*" && find(_subFootprintTypes.begin(), _subFootprintTypes.end(), rosterFootprint->footprintSubType) == _subFootprintTypes.end()) {
		return false;
	}

	if (!_ioePhase.empty() && _ioePhase != "*" && _ioePhase != rosterProgramCourse->coursePhase) {
		return false;
	}

	if (!_courseCodes.empty() && _courseCodes[0] != "*" && find(_courseCodes.begin(), _courseCodes.end(), rosterFlight->courseCode) == _courseCodes.end())
		return false;

	return true;
}

bool CheckIOEPhaseFlightCompositionRuleParam::MatchCompostion(const std::map<std::string, int> flightComposition) const {
	if (_minCompositionWithoutTE.empty())
		return true;

	for (const auto& composition : _minCompositionWithoutTE) {
		if (composition == flightComposition) {
			return true;
		}
	}
	return false;
}