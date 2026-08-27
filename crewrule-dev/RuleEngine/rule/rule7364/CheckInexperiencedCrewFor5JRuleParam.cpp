/**
 * @file CheckInexperiencedCrewFor5JRuleParam.h
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
#include "CheckInexperiencedCrewFor5JRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"
#include "../period/WorkPeriod.h"
#include "../utils/AssignmentUtils.h"


using namespace std;

void CheckInexperiencedCrewFor5JRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    string header, headeValue;
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
        else if (header == "ACTING RANKS") {
            if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
                _strActingRanks = headeValue;
                split(headeValue, '|', _actingRanks);
            }
        }
        else if (header == "ROUTES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _routes);
            }
        }
        else if (header == "ASSIGNMENT GROUPS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _assignmentGroups);
                _assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
            }
        }
        else if (header == "ASSIGNMENTS") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _assignments);
				_assignmentsMatch.SetExpression(headeValue, this->GetRule());
            }
        }
        else if (header == "AIRPORT CATEGORIES") {
            if (headeValue != RuleParamConstant::ALL) {
                split(headeValue, '|', _airportCategories);
            }
        }
        else if (header == "MAX INEXPERIENCE CREWS") {
            if (headeValue != RuleParamConstant::ALL) {
                _maxInexperienceCrews = atoi(headeValue.c_str());
            }
        }
        else
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
    }
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
    std::vector<string> positions;
    if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
        return true;
    return false;
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchSegmentRuleParam(const Segment* segment) const {

    if (!MatchAirportCategories(segment)) {
        return false;
    }

    if (!MatchRoute(segment)) {
        return false;
    }

    return true;
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchAssignment(const Activity* activity) const {
    if (!_assignmentsMatch.Match(*activity)) {
        return false;
    }
    if (!_assignmentGroupsMatch.Match(*activity)) {
        return false;
    }
    return true;
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchAssignment(const string& segmentAssignment) const {
    if (!_assignments.empty() && std::find(_assignments.begin(), _assignments.end(), segmentAssignment) == _assignments.end()) {
        return false;
    }
    if (!_assignmentGroups.empty() && !this->GetRule()->GetDataContext()->isAssignmentInGroup(segmentAssignment, _assignmentGroups)) {
        return false;
    }
    return true;
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchRoute(const Segment* segment) const {
	if (_routes.empty() || _routes[0].empty() || _routes[0] == "*")
		return true;

	string depArr = segment->getDepStation() + "-" + segment->getArrStation();
	return find(_routes.begin(), _routes.end(), depArr) != _routes.end();
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchAirportCategories(const Segment* segment) const {
    if (_airportCategories.empty() || _airportCategories[0].empty() || _airportCategories[0] == "*")
		return true;

    auto depAirportIter = this->GetRule()->GetDataContext()->airportCodeMap.find(segment->getDepStation());
	auto arrAirportIter = this->GetRule()->GetDataContext()->airportCodeMap.find(segment->getArrStation());
	if (depAirportIter == this->GetRule()->GetDataContext()->airportCodeMap.end() || arrAirportIter == this->GetRule()->GetDataContext()->airportCodeMap.end())
		return false;


	string depCategory = depAirportIter->second->category;
	string arrCategory = arrAirportIter->second->category;
	return find(_airportCategories.begin(), _airportCategories.end(), depCategory) != _airportCategories.end()
		|| find(_airportCategories.begin(), _airportCategories.end(), arrCategory) != _airportCategories.end();
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchAirportCategories(const ROSTER* roster) const {
    if (_airportCategories.empty() || _airportCategories[0].empty() || _airportCategories[0] == "*")
        return true;

    auto locationAirportIter = this->GetRule()->GetDataContext()->airportCodeMap.find(roster->location);
    if (locationAirportIter == this->GetRule()->GetDataContext()->airportCodeMap.end())
		return false;

    return find(_airportCategories.begin(), _airportCategories.end(), locationAirportIter->second->category) != _airportCategories.end();
}

bool CheckInexperiencedCrewFor5JRuleParam::MatchActingRanks(const std::string& actingRank) const {
    if (_actingRanks.empty())
        return true;

    return find(_actingRanks.begin(), _actingRanks.end(), actingRank) != _actingRanks.end();
}
