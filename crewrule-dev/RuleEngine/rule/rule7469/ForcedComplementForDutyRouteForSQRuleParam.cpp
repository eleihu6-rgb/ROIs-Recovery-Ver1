/**
 * @file ForcedComplementForDutyRouteForSQRuleParam.cpp
 */

#include "ForcedComplementForDutyRouteForSQRuleParam.h"

#include <algorithm>

#include "UtilFunc.h"
#include "StringUtil.h"
#include "../constant/Constants.h"
#include "../utils/DutyUtils.h"

using namespace std;

std::string ForcedComplementForDutyRouteForSQRuleParam::NormalizeUpperToken(const std::string& value) {
    return strToUpper(trim(value));
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseUpperList(const std::string& value, std::vector<std::string>& output) {
    output.clear();
    const std::string normalized = NormalizeUpperToken(value);
    if (normalized.empty() || normalized == "*" || normalized == RuleParamConstant::ALL) {
        return;
    }
    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string cleaned = NormalizeUpperToken(token);
        if (!cleaned.empty() && cleaned != "*" && cleaned != RuleParamConstant::ALL) {
            output.push_back(cleaned);
        }
    }
}

std::vector<std::string> ForcedComplementForDutyRouteForSQRuleParam::ParseServiceTypes(const std::string& value) {
    std::vector<std::string> output;
    const std::string normalized = NormalizeUpperToken(value);
    if (normalized.empty() || normalized == "*" || normalized == RuleParamConstant::ALL) {
        return output;
    }

    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string t = NormalizeUpperToken(token);
        if (t.empty() || t == "*" || t == RuleParamConstant::ALL) {
            output.clear();
            return output;
        }
        if (t == "F" || t == "FREIGHT" || t == "FREIGHTER" || t == "FREIGTER") {
            output.push_back("F");
        } else if (t == "J" || t == "PASSENGER" || t == "PAX") {
            output.push_back("J");
        } else {
            output.push_back(t);
        }
    }
    return output;
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseDutyRoutes(const std::string& value) {
    _dutyRoutes.clear();
    _matchAnyRoute = false;
    _dutyRoutesLabel = trim(value);

    const std::string normalized = NormalizeUpperToken(value);
    if (normalized.empty() || normalized == "*" || normalized == RuleParamConstant::ALL) {
        _matchAnyRoute = true;
        _dutyRoutesLabel = "*";
        return;
    }

    std::vector<std::string> routes;
    split(normalized.c_str(), '|', routes);
    for (const auto& route : routes) {
        const std::string routeToken = NormalizeUpperToken(route);
        if (routeToken.empty()) {
            continue;
        }
        if (routeToken == "*" || routeToken == RuleParamConstant::ALL) {
            _matchAnyRoute = true;
            continue;
        }
        std::vector<std::string> stations;
        split(routeToken.c_str(), '-', stations);
        if (stations.size() < 2) {
            continue;
        }
        std::string normalizedRoute;
        for (size_t i = 0; i < stations.size(); ++i) {
            const std::string station = NormalizeUpperToken(stations[i]);
            if (station.empty()) {
                continue;
            }
            if (!normalizedRoute.empty()) {
                normalizedRoute += "-";
            }
            normalizedRoute += station;
        }
        if (!normalizedRoute.empty()) {
            _dutyRoutes.push_back(normalizedRoute);
        }
    }

    if (_dutyRoutes.empty() && !_matchAnyRoute) {
        _dutyRoutesLabel = normalized;
    }
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseCompositions(const std::string& value) {
    _compositions.clear();
    _compositionLabel = trim(value);

    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::ALL) {
        _compositionLabel = "*";
        return;
    }

    std::vector<std::string> tokens;
    split(trimmed.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string cleaned = trim(token);
        if (cleaned.empty() || cleaned == "*" || cleaned == RuleParamConstant::ALL) {
            continue;
        }
        _compositions.push_back(cleaned);
    }
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseRankPlans(const std::string& value) {
    _rankPlans.clear();
    _rankPlanLabel = trim(value);

    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::ALL) {
        _rankPlanLabel = "*";
        return;
    }

    std::vector<std::string> entries;
    split(trimmed.c_str(), '|', entries);
    for (const auto& entry : entries) {
        std::vector<std::string> parts;
        split(trim(entry).c_str(), '+', parts);
        std::map<std::string, int> plan;
        for (const auto& part : parts) {
            std::vector<std::string> kv;
            split(trim(part).c_str(), ':', kv);
            if (kv.size() != 2) {
                continue;
            }
            const std::string rank = NormalizeUpperToken(kv[0]);
            if (rank.empty()) {
                continue;
            }
            const int count = std::atoi(trim(kv[1]).c_str());
            if (count != 0) {
                plan[rank] = count;
            }
        }
        if (!plan.empty()) {
            _rankPlans.push_back(plan);
        }
    }
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseParam(const std::string& paramString) {
    std::vector<std::string> tokens;
    split(paramString.c_str(), delimInParam, tokens);
    if (tokens.size() < totalNumParam) {
        Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, not enough parameters: {}", RuleFuncId, paramString);
        return;
    }

    ParseDutyRoutes(tokens[enum_to_underlying(ParamLocation::DUTY_ROUTES)]);
    _serviceTypesUpper = ParseServiceTypes(tokens[enum_to_underlying(ParamLocation::SERVICE_TYPES)]);
    ParseUpperList(tokens[enum_to_underlying(ParamLocation::FLEETS)], _fleetsUpper);
    ParseUpperList(tokens[enum_to_underlying(ParamLocation::FLEET_GROUPS)], _fleetGroupsUpper);
    ParseCompositions(tokens[enum_to_underlying(ParamLocation::COMPOSITIONS)]);
    ParseRankPlans(tokens[enum_to_underlying(ParamLocation::RANK_PLAN)]);
}

void ForcedComplementForDutyRouteForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
        const std::string header = NormalizeUpperToken(iter->first);
        const std::string value = iter->second;
        if (header == "DUTY ROUTES" || header == "DUTY ROUTE") {
            ParseDutyRoutes(value);
        } else if (header == "SERVICE TYPES" || header == "SERVICE TYPE") {
            _serviceTypesUpper = ParseServiceTypes(value);
        } else if (header == "FLEETS" || header == "FLEET") {
            ParseUpperList(value, _fleetsUpper);
        } else if (header == "FLEET GROUPS" || header == "FLEET GROUP" || header == "FLEET GROUP(GRP)" || header == "FLEET GRP") {
            ParseUpperList(value, _fleetGroupsUpper);
        } else if (header == "COMPOSITIONS" || header == "COMPOSITION") {
            ParseCompositions(value);
        } else if (header == "RANK PLAN" || header == "RANK PLANS") {
            ParseRankPlans(value);
        } else {
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}",
                                           dbRule.idRule, dbRule.idRuleParam, iter->first);
        }
    }
}

std::string ForcedComplementForDutyRouteForSQRuleParam::BuildDutyRoute(const std::vector<const Segment*>& segments) {
    std::string route;
    if (segments.empty()) {
        return route;
    }
    for (size_t i = 0; i < segments.size(); ++i) {
        const std::string& dep = segments[i]->getDepStationRead();
        const std::string& arr = segments[i]->getArrStationRead();
        if (i == 0) {
            route += dep;
        }
        if (!arr.empty()) {
            route += "-";
            route += arr;
        }
    }
    return route;
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchDutyRoute(const Duty* duty,
                                                                std::string& routeOut,
                                                                std::vector<const Segment*>& operatingSegments) const {
    routeOut.clear();
    operatingSegments.clear();
    if (duty == nullptr) {
        return false;
    }

    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            return false;
        }
        if (!seg->getIsOperating() || seg->getAssignment() == "DHD" || seg->getAssignment() == "BUS") {
            return false;
        }
        operatingSegments.push_back(seg);
    }

    if (operatingSegments.empty()) {
        return false;
    }

    std::string route = BuildDutyRoute(operatingSegments);
    if (route.empty()) {
        return false;
    }
    routeOut = route;

    if (_matchAnyRoute) {
        return true;
    }
    if (_dutyRoutes.empty()) {
        return false;
    }
    return std::find(_dutyRoutes.begin(), _dutyRoutes.end(), route) != _dutyRoutes.end();
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchServiceType(const Duty* duty) const {
    if (_serviceTypesUpper.empty()) {
        return true;
    }
    if (duty == nullptr) {
        return false;
    }
    bool sawOperating = false;
    bool allOperatingAreFreighter = true;
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        sawOperating = true;
        if (seg->getServiceType() != "F") {
            allOperatingAreFreighter = false;
            break;
        }
    }
    const std::string dutyServiceTypeUpper = (sawOperating && allOperatingAreFreighter) ? "F" : "J";
    return std::find(_serviceTypesUpper.begin(), _serviceTypesUpper.end(), dutyServiceTypeUpper) != _serviceTypesUpper.end();
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchFleets(const std::vector<const Segment*>& segments) const {
    if (_fleetsUpper.empty()) {
        return true;
    }
    if (segments.empty()) {
        return false;
    }
    for (auto* seg : segments) {
        if (seg == nullptr) {
            return false;
        }
        const std::string fleetUpper = seg->getFleetCD();
        if (fleetUpper.empty() ||
            std::find(_fleetsUpper.begin(), _fleetsUpper.end(), fleetUpper) == _fleetsUpper.end()) {
            return false;
        }
    }
    return true;
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchFleetGroups(const std::vector<const Segment*>& segments,
                                                                  const CrewDataContext* dbData) const {
    if (_fleetGroupsUpper.empty()) {
        return true;
    }
    if (segments.empty()) {
        return false;
    }
    if (dbData == nullptr) {
        return false;
    }
    for (auto* seg : segments) {
        if (seg == nullptr) {
            return false;
        }
        const std::string fleetUpper = seg->getFleetCD();
        if (fleetUpper.empty()) {
            return false;
        }
        const auto it = dbData->fleetMap.find(fleetUpper);
        if (it == dbData->fleetMap.end()) {
            return false;
        }
        const std::string fleetGroupUpper = it->second.fleetGrp;
        if (fleetGroupUpper.empty() ||
            std::find(_fleetGroupsUpper.begin(), _fleetGroupsUpper.end(), fleetGroupUpper) == _fleetGroupsUpper.end()) {
            return false;
        }
    }
    return true;
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchComposition(const Duty* duty,
                                                                  const CrewDataContext* dbData) const {
    if (_compositions.empty()) {
        return true;
    }
    if (duty == nullptr) {
        return false;
    }
    std::string composition = duty->getCompositionName();
    if ((composition.empty() || this->GetRule()->IsEditorModel()) && dbData != nullptr) {
        composition = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->GetRule()->GetDataContext());
    }
    if (composition.empty()) {
        return false;
    }
    return std::find(_compositions.begin(), _compositions.end(), composition) != _compositions.end();
}

std::map<std::string, int> ForcedComplementForDutyRouteForSQRuleParam::BuildPlanComposition(const Segment* segment,
                                                                                            const CrewDataContext* dbData) {
    std::map<std::string, int> result;
    if (segment == nullptr || dbData == nullptr) {
        return result;
    }
    const auto& plan = segment->getPlanComposition();
    for (const auto& item : plan) {
        const std::string rank = item.first;
        const int count = item.second;
        const auto it = dbData->rankMap.find(rank);
        if (it == dbData->rankMap.end()) {
            continue;
        }
        if (it->second.isMustCrewRank) {
            result[rank] = count;
        }
    }
    return result;
}

bool ForcedComplementForDutyRouteForSQRuleParam::MatchRankPlan(const std::vector<const Segment*>& segments,
                                                               const CrewDataContext* dbData) const {
    if (_rankPlans.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }
    for (auto* seg : segments) {
        const auto plan = BuildPlanComposition(seg, dbData);
        if (plan.empty()) {
            return false;
        }
        bool matched = false;
        for (const auto& required : _rankPlans) {
            if (required == plan) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            return false;
        }
    }
    return true;
}
