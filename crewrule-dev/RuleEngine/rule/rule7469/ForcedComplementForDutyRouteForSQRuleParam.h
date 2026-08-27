/**
 * @file ForcedComplementForDutyRouteForSQRuleParam.h
 * @brief Parameters for SQ forced complement by duty route (rule 7469).
 */
#ifndef _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULEPARAM_H_
#define _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULEPARAM_H_

#include <map>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"

class ForcedComplementForDutyRouteForSQRule;

class ForcedComplementForDutyRouteForSQRuleParam : public RuleParam {
    friend class ForcedComplementForDutyRouteForSQRule;
public:
    explicit ForcedComplementForDutyRouteForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7469;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 6;

    enum class ParamLocation {
        DUTY_ROUTES = 0,
        SERVICE_TYPES = 1,
        FLEETS = 2,
        FLEET_GROUPS = 3,
        COMPOSITIONS = 4,
        RANK_PLAN = 5
    };

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool MatchDutyRoute(const Duty* duty,
                        std::string& routeOut,
                        std::vector<const Segment*>& operatingSegments) const;
    bool MatchServiceType(const Duty* duty) const;
    bool MatchFleets(const std::vector<const Segment*>& segments) const;
    bool MatchFleetGroups(const std::vector<const Segment*>& segments, const CrewDataContext* dbData) const;
    bool MatchComposition(const Duty* duty, const CrewDataContext* dbData) const;
    bool MatchRankPlan(const std::vector<const Segment*>& segments, const CrewDataContext* dbData) const;

    bool HasCompositionRequirement() const { return !_compositions.empty(); }
    bool HasRankPlanRequirement() const { return !_rankPlans.empty(); }
    const std::string& GetCompositionLabel() const { return _compositionLabel; }
    const std::string& GetRankPlanLabel() const { return _rankPlanLabel; }
    const std::string& GetDutyRoutesLabel() const { return _dutyRoutesLabel; }

private:
    bool _matchAnyRoute{false};
    std::vector<std::string> _dutyRoutes{};
    std::vector<std::string> _serviceTypesUpper{};
    std::vector<std::string> _fleetsUpper{};
    std::vector<std::string> _fleetGroupsUpper{};
    std::vector<std::string> _compositions{};
    std::vector<std::map<std::string, int>> _rankPlans{};

    std::string _dutyRoutesLabel{"*"};
    std::string _compositionLabel{"*"};
    std::string _rankPlanLabel{"*"};

    static std::string NormalizeUpperToken(const std::string& value);
    static void ParseUpperList(const std::string& value, std::vector<std::string>& output);
    static std::vector<std::string> ParseServiceTypes(const std::string& value);
    void ParseDutyRoutes(const std::string& value);
    void ParseCompositions(const std::string& value);
    void ParseRankPlans(const std::string& value);

    static std::string BuildDutyRoute(const std::vector<const Segment*>& segments);
    static std::map<std::string, int> BuildPlanComposition(const Segment* segment, const CrewDataContext* dbData);
};

#endif  // _FORCEDCOMPLEMENTFORDUTYROUTEFORSQRULEPARAM_H_
